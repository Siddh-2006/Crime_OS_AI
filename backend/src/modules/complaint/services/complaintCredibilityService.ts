import { IComplaint } from '../models/Complaint.model';
import crypto from 'crypto';
import { fastCall } from '../../../shared/llm/ollamaClient';

const EVIDENCE_COVERAGE_MAP: Record<string, string[]> = {
  'Financial Fraud': ['bank statement', 'transaction screenshot', 'upi', 'passbook'],
  'Cyber Bullying': ['screenshot', 'chat', 'social media', 'profile'],
  'Theft': ['photo', 'bill', 'receipt', 'cctv'],
};

export async function computeCredibilityScore(complaint: IComplaint): Promise<any> {
  // 1. Specificity Density
  // Regex counts for dates, amounts, phone numbers, UPI patterns
  const description = complaint.detailedDescription || '';
  const wordCount = description.split(/\s+/).length || 1;
  
  const dateMatches = (description.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi) || []).length;
  const amountMatches = (description.match(/(?:rs\.?|₹|inr)\s*\d+(?:,\d+)*(?:\.\d+)?|\d+(?:,\d+)*(?:\.\d+)?\s*(?:rs\.?|rupees)/gi) || []).length;
  const phoneMatches = (description.match(/\b(?:\+91|91)?[6789]\d{9}\b/g) || []).length;
  const upiMatches = (description.match(/\b[\w.-]+@[\w.-]+\b/g) || []).length; // simple upi/email
  
  const totalSpecifics = dateMatches + amountMatches + phoneMatches + upiMatches;
  let specificity_density = (totalSpecifics / wordCount) * 100;
  specificity_density = Math.min(specificity_density, 10); // cap at 10 specifics per 100 words -> 1.0 score
  const specificityScore = specificity_density / 10; // normalized 0 to 1

  // 2. Evidence Coverage Ratio
  let evidence_coverage_ratio = 0.5; // default
  const cat = complaint.category || complaint.crimeCategory || '';
  const expectedKeywords = EVIDENCE_COVERAGE_MAP[cat] || [];
  
  if (expectedKeywords.length > 0 && complaint.evidence && complaint.evidence.length > 0) {
    const presentKeywords = new Set();
    complaint.evidence.forEach(e => {
      const text = `${e.originalFilename} ${e.aiMetadata?.ocrText || ''}`.toLowerCase();
      expectedKeywords.forEach(kw => {
        if (text.includes(kw)) presentKeywords.add(kw);
      });
    });
    evidence_coverage_ratio = presentKeywords.size / expectedKeywords.length;
  } else if (complaint.evidence && complaint.evidence.length >= 2) {
    evidence_coverage_ratio = 1.0;
  } else if (complaint.evidence && complaint.evidence.length === 1) {
    evidence_coverage_ratio = 0.75;
  }

  // 3. Cross Corroboration
  let cross_corroboration = 0.5; // default
  const entities = complaint.complaintIntelligence?.entities || [];
  if (entities.length > 0) {
    let corroborated = 0;
    entities.forEach((ent: any) => {
      const name = ent.name.toLowerCase();
      const inDesc = description.toLowerCase().includes(name);
      const inEvidence = complaint.evidence?.some(e => 
        (e.aiMetadata?.ocrText || '').toLowerCase().includes(name) || 
        (e.originalFilename || '').toLowerCase().includes(name)
      );
      if (inDesc && inEvidence) corroborated++;
    });
    cross_corroboration = corroborated / entities.length;
  } else if (complaint.evidence && complaint.evidence.length > 0) {
    cross_corroboration = 0.7; // some evidence exists, good enough baseline
  }

  // 4. Known Entity Match (Stubbed)
  const known_entity_match = 0; 

  // 5. Response Resolution Rate (Stubbed for now, based on requests if any)
  const response_resolution_rate = 1.0;

  // Calculate Completeness Score
  const completeness_score = Math.min(100, Math.round(
    (specificityScore * 25) + 
    (evidence_coverage_ratio * 25) +
    (cross_corroboration * 30) +
    (known_entity_match * 10) +
    (response_resolution_rate * 20)
  ));

  // Consistency Flags (Debounced LLM Call)
  const complaintAny = complaint as any;
  let consistency_flags = complaintAny.credibilityAssessment?.consistency_flags || [];
  const currentContentHash = crypto.createHash('md5').update(description + (complaint.evidence?.length || 0).toString()).digest('hex');
  const storedHash = complaintAny.credibilityAssessment?.contentHash;

  if (currentContentHash !== storedHash && complaint.evidence && complaint.evidence.length > 0) {
    const evidenceFacts = complaint.evidence.map(e => `File: ${e.originalFilename}\nExtracted Text: ${e.aiMetadata?.ocrText || 'None'}`).join('\n\n');
    
    // Prevent huge context limit issues
    const truncatedEvidence = evidenceFacts.substring(0, 3000);
    const truncatedDesc = description.substring(0, 3000);

    const prompt = `Compare the complaint narrative against the following extracted evidence facts. List ONLY explicit contradictions (dates, amounts, names that don't match). Return empty array if none.
    
    NARRATIVE:
    ${truncatedDesc}

    EVIDENCE FACTS:
    ${truncatedEvidence}`;

    try {
      const aiResponseRaw = await fastCall('Analyze credibility', prompt);
      const aiResponse = String(aiResponseRaw || '');
      // Clean up response if it's a JSON array or list
      let flags = [];
      try {
        const jsonMatch = aiResponse.match(/\[.*\]/s);
        if (jsonMatch) {
          flags = JSON.parse(jsonMatch[0]);
        } else if (aiResponse.includes('- ')) {
          flags = aiResponse.split('\n').filter((l: string) => l.trim().startsWith('-')).map((l: string) => l.replace('-', '').trim());
        } else if (aiResponse.trim().length > 0 && !aiResponse.toLowerCase().includes('empty array') && !aiResponse.toLowerCase().includes('no explicit')) {
          flags = [aiResponse.trim()];
        }
      } catch (e) {
        flags = [aiResponse.trim()];
      }
      consistency_flags = flags;
    } catch (e) {
      console.error('Credibility LLM call failed', e);
    }
  }

  return {
    completeness_score,
    breakdown: {
      specificity_density: specificityScore,
      evidence_coverage_ratio,
      cross_corroboration,
      known_entity_match,
      response_resolution_rate
    },
    consistency_flags,
    contentHash: currentContentHash,
    computedAt: new Date().toISOString()
  };
}
