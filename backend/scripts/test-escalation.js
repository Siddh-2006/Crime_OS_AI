require('dotenv').config();
const mongoose = require('mongoose');

// --- Mock Redis & BullMQ Before Importing Services ---
const redisConfig = require('../dist/config/redis');
redisConfig.getRedisClient = () => ({
  on: () => {},
  get: async () => null,
  set: async () => {},
  pipeline: () => ({ incr: () => {}, expire: () => {}, exec: async () => [] })
});

const bullmqModule = require('../dist/config/bullmq');
bullmqModule.createQueue = (name) => {
  console.log(`[MOCK] createQueue bypassed for ${name}`);
  return { add: async (type, payload) => {
    console.log(`[MOCK] Job ${type} queued for email delivery to ${payload.to}`);
  } };
};
bullmqModule.createWorker = (name) => {
  console.log(`[MOCK] createWorker bypassed for ${name}`);
  return { on: () => {} };
};

// --- Now Import Services ---
const { InvestigationOrchestrator } = require('../dist/modules/investigation/services/investigationOrchestrator');
const { CaseChecklist } = require('../dist/modules/investigation/models/CaseChecklist.model');
const { Escalation } = require('../dist/modules/investigation/models/Escalation.model');
const { DiaryEntry } = require('../dist/modules/investigation/models/DiaryEntry.model');
const { CaseEntity } = require('../dist/modules/investigation/models/CaseEntity.model');

// Mock external services to avoid actual LLM calls taking 30 seconds each, as we are purely testing escalation logic.
jestMockFastCall = async () => 'Mock summary: This case is stuck.';
jestMockDeepCall = async () => ({
  ranked_next_steps: [],
  suspect_candidates: [],
  narrative_summary: 'Nothing to do.'
});

async function seedFakeCase() {
  const CASE_ID = new mongoose.Types.ObjectId();
  const Complaint = mongoose.models.Complaint || mongoose.model('Complaint', new mongoose.Schema({})); // minimal mock if needed, but we don't strictly need it in DB if not enforcing foreign keys strictly. Wait, CaseChecklist refs it, but Mongo doesn't care about FK unless populated.
  
  await CaseChecklist.create([
    { case_id: CASE_ID, sop_id: 'SOP_002', step_id: 'step_bank_kyc', title: 'Request Bank KYC from HDFC', status: 'pending', criticality: 'high', required_evidence: [] }
  ]);
  
  await CaseEntity.create([
    { case_id: CASE_ID, entity_type: 'bank_account', value: '1234567890 (HDFC)', first_seen_entry_id: 'entry-1' }
  ]);
  
  // Create complaint just in case
  const cNum = `C-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await mongoose.connection.collection('complaints').insertOne({ _id: CASE_ID, complaintNumber: cNum, code: cNum });
  
  return CASE_ID;
}

async function runTest() {
  console.log("=== STARTING ESCALATION E2E TEST ===");

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crime-os');
  
  // Patch Ollama clients for this test only to avoid hitting the real local LLM multiple times.
  const ollamaClient = require('../dist/shared/llm/ollamaClient');
  ollamaClient.fastCall = jestMockFastCall;
  ollamaClient.deepCall = jestMockDeepCall;

  // We mock callLegalAgent and callIoRecommendation
  const legalClient = require('../dist/shared/clients/legalAgentClient');
  const recClient = require('../dist/shared/clients/ioRecommendationClient');
  legalClient.callLegalAgent = async () => 'Mock Legal';
  recClient.callIoRecommendation = async () => 'Mock Rec';

  const { createApp } = require('../dist/app');
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  // --- SCENARIO 1: MANUAL ESCALATION ---
  console.log("\n--- SCENARIO 1: MANUAL ESCALATION ---");
  const caseId1 = await seedFakeCase();
  console.log(`Seeded Case ID 1: ${caseId1}`);

  try {
    const fetch = require('node-fetch');
    const response = await fetch(`${baseUrl}/cases/${caseId1}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Officer override: suspect fled country.' })
    });
    
    if (response.status === 201) {
      console.log("  ✅ POST /escalate returns 201 CREATED");
    } else {
      console.error(`  ❌ POST /escalate returned ${response.status}`);
      const txt = await response.text();
      console.error(txt);
    }

    const escManual = await Escalation.findOne({ case_id: caseId1 });
    if (escManual && escManual.reason === 'Officer override: suspect fled country.') {
      console.log("  ✅ Escalation document created with correct reason");
    } else {
      console.error("  ❌ Escalation document missing or incorrect");
    }
  } catch (err) {
    console.error("Failed to run Scenario 1 via HTTP. If server is not running, we can test via orchestrator directly.", err.message);
  }

  // --- SCENARIO 2: AUTO ESCALATION ON 3 CONSECUTIVE RUNS ---
  console.log("\n--- SCENARIO 2: AUTO ESCALATION ON 3 RUNS ---");
  const caseId2 = await seedFakeCase();
  console.log(`Seeded Case ID 2: ${caseId2}`);

  console.log("Running Analysis 1...");
  await InvestigationOrchestrator.runAnalysis(caseId2);
  
  let esc = await Escalation.findOne({ case_id: caseId2 });
  if (!esc) console.log("  ✅ Run 1: No escalation");

  console.log("Running Analysis 2...");
  await InvestigationOrchestrator.runAnalysis(caseId2);
  
  esc = await Escalation.findOne({ case_id: caseId2 });
  if (!esc) console.log("  ✅ Run 2: No escalation");

  console.log("Running Analysis 3...");
  await InvestigationOrchestrator.runAnalysis(caseId2);
  
  esc = await Escalation.findOne({ case_id: caseId2 });
  if (esc && esc.reason.includes('3 consecutive')) {
    console.log("  ✅ Run 3: Escalation triggered correctly!");
    console.log("  ✅ Generated summary:", esc.summary);
  } else {
    console.error("  ❌ Run 3: Escalation failed to trigger");
  }

  const diary = await DiaryEntry.findOne({ case_id: caseId2, event_type: 'escalation_raised' });
  if (diary) {
    console.log("  ✅ Diary entry 'escalation_raised' was appended");
  } else {
    console.error("  ❌ Diary entry missing");
  }

  console.log("\nTest completed.");
  server.close();
  process.exit(0);
}

runTest().catch(console.error);
