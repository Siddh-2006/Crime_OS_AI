import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { AnalysisSnapshot } from '../src/modules/investigation/models/AnalysisSnapshot.model';
import { CaseChecklist } from '../src/modules/investigation/models/CaseChecklist.model';
import { RequestThread } from '../src/modules/investigation/models/RequestThread.model';
import { InvestigationOrchestrator } from '../src/modules/investigation/services/investigationOrchestrator';

async function refreshAnalysis() {
  await mongoose.connect('mongodb://localhost:27017/crime-os');
  const caseId = process.argv[2] || '6a5d0d84c59adc1091034274';

  console.log(`Resetting AI Analysis for Case ${caseId}...`);

  // Delete previous snapshots and checklists
  await AnalysisSnapshot.deleteMany({ case_id: caseId });
  await CaseChecklist.deleteMany({ case_id: caseId });
  await RequestThread.deleteMany({ case_id: caseId });

  console.log('Old snapshots and checklists cleared.');
  console.log('Running fresh AI Analysis (this will take ~10 seconds)...');

  try {
    const snapshot = await InvestigationOrchestrator.runAnalysis(caseId);
    console.log('✅ Analysis complete! New Snapshot ID:', snapshot.snapshot_id);
    console.log('Legal Sections:', snapshot.suggested_legal_sections);
    
    const checklistCount = await CaseChecklist.countDocuments({ case_id: caseId });
    console.log(`✅ Synced ${checklistCount} steps to CaseChecklist collection.`);

  } catch (err) {
    console.error('Error running analysis:', err);
  }

  process.exit(0);
}

refreshAnalysis();
