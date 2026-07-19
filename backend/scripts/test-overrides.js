require('dotenv').config();
const mongoose = require('mongoose');

// Mock Redis & BullMQ
const redisConfig = require('../dist/config/redis');
redisConfig.getRedisClient = () => ({
  on: () => {},
  get: async () => null,
  set: async () => {},
  pipeline: () => ({ incr: () => {}, expire: () => {}, exec: async () => [] })
});

const bullmqModule = require('../dist/config/bullmq');
bullmqModule.createQueue = (name) => {
  return { add: async () => {} };
};
bullmqModule.createWorker = (name) => {
  return { on: () => {} };
};

const { InvestigationOrchestrator } = require('../dist/modules/investigation/services/investigationOrchestrator');
const { AnalysisSnapshot } = require('../dist/modules/investigation/models/AnalysisSnapshot.model');
const { DiaryEntry } = require('../dist/modules/investigation/models/DiaryEntry.model');
const { CaseChecklist } = require('../dist/modules/investigation/models/CaseChecklist.model');
const { CaseEntity } = require('../dist/modules/investigation/models/CaseEntity.model');

// Mock Ollama Client
const ollamaClient = require('../dist/shared/llm/ollamaClient');
ollamaClient.fastCall = async () => 'Mock Fast';

// For the first deepCall (initial analysis)
let deepCallCounter = 0;
ollamaClient.deepCall = async (system, user, opts) => {
  deepCallCounter++;
  if (deepCallCounter === 1) {
    return {
      ranked_next_steps: [{ step_id: 'step_bank_kyc', reason: 'Initial guess', confidence: 0.9, evidence_needed: [] }],
      suspect_candidates: [{ entity: 'John Doe', confidence: 0.8, supporting_evidence_ids: [], contradicting_evidence_ids: [] }],
      narrative_summary: 'John Doe looks very suspicious.'
    };
  } else {
    // This is the correction call
    return {
      ranked_next_steps: [{ step_id: 'step_bank_kyc', reason: 'Agreed', confidence: 0.9, evidence_needed: [] }],
      suspect_candidates: [{ entity: 'John Doe', confidence: 0.1, supporting_evidence_ids: [], contradicting_evidence_ids: ['human-insight'] }],
      narrative_summary: 'As corrected by the officer, John Doe is no longer the primary suspect.'
    };
  }
};

const legalClient = require('../dist/shared/clients/legalAgentClient');
const recClient = require('../dist/shared/clients/ioRecommendationClient');
legalClient.callLegalAgent = async () => 'Mock Legal';
recClient.callIoRecommendation = async () => 'Mock Rec';

async function seedFakeCase() {
  const CASE_ID = new mongoose.Types.ObjectId();
  const cNum = `C-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await mongoose.connection.collection('complaints').insertOne({ _id: CASE_ID, complaintNumber: cNum, code: cNum });
  return CASE_ID;
}

async function runTest() {
  console.log("=== STARTING OVERRIDE E2E TEST ===");
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crime-os');
  
  const caseId = await seedFakeCase();
  console.log(`Seeded Case ID: ${caseId}`);

  console.log("\n1. Running initial Orchestrator Analysis...");
  await InvestigationOrchestrator.runAnalysis(caseId.toString());

  const initialSnapshot = await AnalysisSnapshot.findOne({ case_id: caseId }).sort({ timestamp: -1 });
  console.log(`   Created Snapshot ID: ${initialSnapshot.snapshot_id}`);
  console.log(`   Initial Suspect: ${initialSnapshot.suspect_candidates[0].entity}, Conf: ${initialSnapshot.suspect_candidates[0].confidence}`);

  console.log("\n2. Sending Officer Correction...");
  const correctionMsg = "John Doe has an alibi. Reduce his suspicion completely.";
  const correctedSnapshot = await InvestigationOrchestrator.correctSnapshot(caseId.toString(), initialSnapshot.snapshot_id, correctionMsg);

  console.log(`   Corrected Snapshot ID: ${correctedSnapshot.snapshot_id}`);
  console.log(`   Parent Snapshot ID: ${correctedSnapshot.parent_snapshot_id}`);
  console.log(`   New Suspect Conf: ${correctedSnapshot.suspect_candidates[0].confidence}`);

  // Assertions
  if (correctedSnapshot.parent_snapshot_id === initialSnapshot.snapshot_id) {
    console.log("  ✅ parent_snapshot_id matches initial snapshot");
  } else {
    console.error("  ❌ parent_snapshot_id DOES NOT MATCH");
  }

  if (correctedSnapshot.trigger === 'officer_override') {
    console.log("  ✅ trigger is 'officer_override'");
  } else {
    console.error("  ❌ trigger is NOT 'officer_override'");
  }

  console.log("\n3. Validating Diary Entry (Audit Trail)...");
  const diaryEntry = await DiaryEntry.findOne({ case_id: caseId, event_type: 'override_correction' });
  
  if (diaryEntry) {
    console.log("  ✅ Found 'override_correction' diary entry");
    console.log("     Payload:", diaryEntry.payload);
    
    if (diaryEntry.payload.correction_message === correctionMsg) {
      console.log("  ✅ Verbatim correction message was logged for audit.");
    } else {
      console.error("  ❌ Correction message missing or mutated in diary!");
    }
    
    if (diaryEntry.payload.parent_snapshot_id === initialSnapshot.snapshot_id) {
      console.log("  ✅ Diary entry correctly links to the parent snapshot ID.");
    } else {
      console.error("  ❌ Diary entry missing parent_snapshot_id link!");
    }
  } else {
    console.error("  ❌ Missing diary entry for override!");
  }

  console.log("\n4. Testing Pure Manual Snapshot...");
  const manualPayload = {
    ranked_next_steps: [{ step_id: 'step_manual', reason: 'I said so', confidence: 1.0, evidence_needed: [] }],
    suspect_candidates: [{ entity: 'Jane Doe', confidence: 0.99, supporting_evidence_ids: [], contradicting_evidence_ids: [] }],
    narrative_summary: 'I am writing this myself.'
  };

  const manualSnapshot = await InvestigationOrchestrator.createManualSnapshot(caseId.toString(), manualPayload);
  console.log(`   Manual Snapshot ID: ${manualSnapshot.snapshot_id}`);
  
  if (manualSnapshot.officer_authored === true) {
    console.log("  ✅ manual snapshot marked as officer_authored: true");
  } else {
    console.error("  ❌ manual snapshot officer_authored is false!");
  }
  
  if (manualSnapshot.parent_snapshot_id === correctedSnapshot._id.toString()) {
     console.log("  ✅ manual snapshot parent is the previous (corrected) snapshot ObjectId");
  }

  console.log("\nTest completed.");
  process.exit(0);
}

runTest().catch(console.error);
