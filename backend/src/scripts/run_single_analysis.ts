import mongoose from 'mongoose';
import * as fs from 'fs';
import env from '../config/env';
import { buildFactsObject } from '../modules/investigation/services/factsAssemblyService';
import { InvestigationOrchestrator } from '../modules/investigation/services/investigationOrchestrator';

async function main() {
  const caseId = process.argv[2];
  const compressionEnabled = process.argv[3] === 'true';
  const tmpFile = process.argv[4];


  await mongoose.connect(env.MONGODB_URI);
  console.log(`\n\x1b[90m[run_single_analysis.ts] Starting analysis. Compression Enabled: ${compressionEnabled}\x1b[0m`);
  
  const t0 = Date.now();
  const facts = await buildFactsObject(caseId);
  const factsCharCount = JSON.stringify(facts).length;
  
  const snapshot = await InvestigationOrchestrator.runAnalysis(caseId, 'manual', 'en');
  const wallClockMs = Date.now() - t0;

  const evidenceIds: string[] = [];
  const departmentIds: string[] = [];
  (snapshot?.ranked_next_steps || []).forEach((step: any) => {
    if (step?.department_entity_id) departmentIds.push(step.department_entity_id);
  });
  (snapshot?.evidence_section_recommendations || []).forEach((rec: any) => {
    if (rec?.evidence_id) evidenceIds.push(rec.evidence_id);
  });
  (snapshot?.participant_recommendations || []).forEach((rec: any) => {
    (rec?.supporting_evidence_ids || []).forEach((id: string) => evidenceIds.push(id));
  });

  const result = {
    wallClockMs,
    narrativeSummary: snapshot?.narrative_summary || '',
    rankedNextSteps: snapshot?.ranked_next_steps || [],
    suggestedLegalSections: snapshot?.suggested_legal_sections || [],
    evidenceIds: [...new Set(evidenceIds)],
    departmentIds: [...new Set(departmentIds)],
    factsCharCount
  };

  fs.writeFileSync(tmpFile, JSON.stringify(result, null, 2));
  console.log(`\x1b[90m[run_single_analysis.ts] Done in ${wallClockMs}ms.\x1b[0m\n`);
  process.exit(0);
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
