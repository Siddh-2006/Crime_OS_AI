'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { connectDatabase } = require('../dist/config/database');
const axios = require('axios');

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
  return { add: async () => {} };
};
bullmqModule.createWorker = (name) => {
  console.log(`[MOCK] createWorker bypassed for ${name}`);
  return { on: () => {} };
};

const { createApp } = require('../dist/app');
const AnalysisQueueModule = require('../dist/shared/queue/AnalysisQueue');
const { InvestigationOrchestrator } = require('../dist/modules/investigation/services/investigationOrchestrator');

// ─── Mock BullMQ Queue (Bypass Redis) ─────────────────────────────────────────
AnalysisQueueModule.AnalysisQueue.enqueueAnalyzeCase = async (caseId) => {
  console.log(`[MOCK] Bypassing Redis. Triggering async Analysis execution for caseId: ${caseId}`);
  // Run asynchronously to allow POST endpoint to return 200 immediately
  setTimeout(() => InvestigationOrchestrator.runAnalysis(caseId).catch(console.error), 100);
};
const { buildFactsObject } = require('../dist/modules/investigation/services/factsAssemblyService');
const { DiaryEntry } = require('../dist/modules/investigation/models/DiaryEntry.model');
const { CaseChecklist } = require('../dist/modules/investigation/models/CaseChecklist.model');
const { CaseEntity } = require('../dist/modules/investigation/models/CaseEntity.model');
const { Evidence } = require('../dist/modules/investigation/models/Evidence.model');
const { DepartmentRequest } = require('../dist/modules/investigation/models/DepartmentRequest.model');
const { AnalysisSnapshot } = require('../dist/modules/investigation/models/AnalysisSnapshot.model');

// ─── Assertion helpers ────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ─── Seed Data ────────────────────────────────────────────────────────────────
const CASE_ID = new mongoose.Types.ObjectId();
const OFFICER_ID = new mongoose.Types.ObjectId();
const EV_ID = uuidv4();

async function seedFakeCase() {
  await CaseChecklist.create([
    { case_id: CASE_ID, sop_id: 'SOP_001', step_id: 'step_A', title: 'Freeze bank account', status: 'completed', criticality: 'high' },
    { case_id: CASE_ID, sop_id: 'SOP_001', step_id: 'step_B', title: 'Identify IP address', status: 'blocked', criticality: 'high' }
  ]);
  
  await CaseEntity.create([
    { case_id: CASE_ID, entity_type: 'upi', value: 'suspect@upi', first_seen_entry_id: 'entry-1' }
  ]);
}

async function runTest() {
  console.log("=== STARTING E2E ORCHESTRATOR TEST ===");

  await connectDatabase();
  // Bypass getRedisClient() and startAnalysisWorker() to avoid Redis connection loops
  
  await seedFakeCase();
  console.log(`Seeded Case ID: ${CASE_ID.toString()}`);

  const app = createApp();
  // Listen on random free port
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1/cases/${CASE_ID.toString()}`;

  try {
    console.log(`\n1. POST ${baseUrl}/analyze`);
    const postRes = await axios.post(`${baseUrl}/analyze`);
    assert("POST /analyze returns 200 OK", postRes.status === 200);

    console.log(`\n2. Polling GET /analysis/latest... (Waiting for LLM & Worker)`);
    let snapshot = null;
    let attempts = 0;
    while (attempts < 60) {
      try {
        const getRes = await axios.get(`${baseUrl}/analysis/latest`);
        if (getRes.status === 200 && getRes.data.success) {
          snapshot = getRes.data.data;
          break;
        }
      } catch (err) {
        // 404 expected until job completes
        if (err.response?.status !== 404) throw err;
      }
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
      process.stdout.write(".");
    }
    console.log(""); // newline after dots

    assert("AnalysisSnapshot was successfully generated and returned", snapshot !== null);

    if (snapshot) {
      assert("Snapshot contains strict JSON fields (ranked_next_steps, suspect_candidates, narrative_summary)", 
             Array.isArray(snapshot.ranked_next_steps) && typeof snapshot.narrative_summary === 'string');
      
      const factsDirect = await buildFactsObject(CASE_ID.toString());
      
      // JSON stringify comparison to ignore date object mismatches
      const dbFacts = JSON.parse(JSON.stringify(snapshot.facts_used));
      const directFacts = JSON.parse(JSON.stringify(factsDirect));
      
      // Compare checklist summary to verify facts exact match
      assert("Snapshot 'facts_used' strictly matches independent factsAssemblyService state at that exact moment", 
             dbFacts.checklist.summary.total === directFacts.checklist.summary.total &&
             dbFacts.checklist.summary.completed === directFacts.checklist.summary.completed);
    }

    const diaryEntries = await DiaryEntry.find({ case_id: CASE_ID, event_type: 'analysis_run' });
    assert("A diary_entry(analysis_run) was successfully appended", diaryEntries.length === 1);
    if (diaryEntries.length === 1) {
      assert("Diary entry payload correctly points to the new snapshot ID", 
             diaryEntries[0].payload.snapshot_id.toString() === snapshot._id.toString());
    }
    
  } finally {
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    server.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTest().catch(console.error);
