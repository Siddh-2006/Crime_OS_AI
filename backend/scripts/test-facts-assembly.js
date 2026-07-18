/**
 * Unit test for factsAssemblyService.buildFactsObject
 *
 * Run from backend/: node scripts/test-facts-assembly.js
 *
 * Strategy: seed a known case, call buildFactsObject, assert shape + values, cleanup.
 */

'use strict';

require('dotenv').config();   // loads backend/.env automatically
const mongoose = require('mongoose');

const { v4: uuidv4 } = require('uuid');

// ─── Inline schemas (must match TypeScript models exactly) ────────────────────

const DiaryEntrySchema = new mongoose.Schema({
  case_id:    { type: mongoose.Schema.Types.ObjectId, required: true },
  entry_id:   { type: String, required: true, unique: true },
  timestamp:  { type: Date, default: Date.now },
  actor:      { type: { type: String }, id: String },
  event_type: { type: String },
  payload:    mongoose.Schema.Types.Mixed,
  ref_ids:    { evidence_id: String, request_id: String, step_id: String, snapshot_id: String },
}, { versionKey: false });

DiaryEntrySchema.pre(['updateOne','findOneAndUpdate','findOneAndDelete','deleteOne','deleteMany'], function () {
  throw new Error('DiaryEntry is append-only. Updates and deletes are not permitted.');
});

const CaseChecklistSchema = new mongoose.Schema({
  case_id:    mongoose.Schema.Types.ObjectId,
  sop_id:     String, step_id: String, title: String,
  status:     { type: String, default: 'pending' },
  criticality: String,
  required_evidence: [String], proof_evidence_ids: [String],
  locked_by_request_id: String,
}, { timestamps: true, versionKey: false });

const CaseEntitySchema = new mongoose.Schema({
  case_id:    mongoose.Schema.Types.ObjectId,
  entity_type: String, value: String,
  first_seen_entry_id: String,
  corroborating_evidence_ids: [String],
}, { timestamps: true, versionKey: false });

const EvidenceSchema = new mongoose.Schema({
  case_id:     mongoose.Schema.Types.ObjectId,
  evidence_id: { type: String, unique: true },
  type: String,
  storage_ref: String,
  ai_description: String, ai_tags: [String],
  uploader_id: mongoose.Schema.Types.ObjectId,
  status: { type: String, default: 'pending' },
  linked_diary_entry_id: String, linked_request_id: String,
}, { timestamps: true, versionKey: false });

const DeptRequestSchema = new mongoose.Schema({
  case_id:              mongoose.Schema.Types.ObjectId,
  request_id:           { type: String, unique: true },
  step_id:              String, department_entity_id: String,
  draft_content:        String, attachments: [String],
  status:               { type: String, default: 'draft' },
  sent_via: String, sent_at: Date, response_ref: String, response_at: Date,
}, { timestamps: true, versionKey: false });

// Register (or retrieve if already registered from a previous test run in same process)
function getModel(name, schema) {
  try { return mongoose.model(name); } catch { return mongoose.model(name, schema); }
}

const DiaryEntry       = getModel('DiaryEntry',        DiaryEntrySchema);
const CaseChecklist    = getModel('CaseChecklist',     CaseChecklistSchema);
const CaseEntity       = getModel('CaseEntity',        CaseEntitySchema);
const Evidence         = getModel('Evidence',          EvidenceSchema);
const DepartmentRequest = getModel('DepartmentRequest', DeptRequestSchema);

// ─── Inline buildFactsObject (replicates the TS service logic) ────────────────

const RECENT_DIARY_LIMIT = 20;

async function buildFactsObject(caseId) {
  const oid = new mongoose.Types.ObjectId(caseId);

  const [checklistDocs, entityDocs, evidenceDocs, requestDocs, diaryDocs] = await Promise.all([
    CaseChecklist.find({ case_id: oid }).lean().exec(),
    CaseEntity.find({ case_id: oid }).lean().exec(),
    Evidence.find({ case_id: oid }).lean().exec(),
    DepartmentRequest.find({ case_id: oid }).lean().exec(),
    DiaryEntry.find({ case_id: oid }).sort({ timestamp: -1 }).limit(RECENT_DIARY_LIMIT).lean().exec(),
  ]);

  const stepsByStatus = { completed: 0, in_progress: 0, blocked: 0, pending: 0 };
  let highCriticalityPending = 0;
  const steps = checklistDocs.map((s) => {
    stepsByStatus[s.status]++;
    if ((s.status === 'pending' || s.status === 'blocked') && s.criticality === 'high') highCriticalityPending++;
    return { step_id: s.step_id, sop_id: s.sop_id, title: s.title, status: s.status,
      criticality: s.criticality, required_evidence: s.required_evidence ?? [],
      proof_evidence_ids: s.proof_evidence_ids ?? [], locked_by_request_id: s.locked_by_request_id };
  });
  const total = checklistDocs.length;
  const checklistSummary = { total, ...stepsByStatus,
    completion_pct: total ? Math.round((stepsByStatus.completed / total) * 100) : 0,
    high_criticality_pending: highCriticalityPending };

  const byType = {};
  const rawEntities = entityDocs.map((e) => {
    if (!byType[e.entity_type]) byType[e.entity_type] = [];
    byType[e.entity_type].push(e.value);
    return { entity_type: e.entity_type, value: e.value,
      first_seen_entry_id: e.first_seen_entry_id, corroborating_evidence_ids: e.corroborating_evidence_ids ?? [] };
  });

  const evSummary = { total: evidenceDocs.length, verified: 0, pending: 0, rejected: 0 };
  const evItems = evidenceDocs.map((ev) => {
    evSummary[ev.status]++;
    return { evidence_id: ev.evidence_id, type: ev.type, status: ev.status,
      ai_description: ev.ai_description, ai_tags: ev.ai_tags ?? [] };
  });

  const reqSummary = { draft: 0, reviewed: 0, sent: 0, acknowledged: 0, response_received: 0, overdue: 0 };
  const reqItems = requestDocs.map((r) => {
    reqSummary[r.status]++;
    return { request_id: r.request_id, step_id: r.step_id,
      department_entity_id: r.department_entity_id, status: r.status,
      sent_at: r.sent_at, response_at: r.response_at };
  });

  const recentDiary = diaryDocs.reverse().map((d) => ({
    entry_id: d.entry_id, timestamp: d.timestamp,
    actor: { type: d.actor.type, id: d.actor.id },
    event_type: d.event_type, payload: d.payload ?? {}, ref_ids: d.ref_ids ?? {},
  }));

  return {
    meta: { case_id: caseId, assembled_at: new Date() },
    checklist: { summary: checklistSummary, steps },
    entities:  { by_type: byType, raw: rawEntities },
    evidence:  { summary: evSummary, items: evItems },
    department_requests: { summary: reqSummary, items: reqItems },
    recent_diary: recentDiary,
  };
}

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

function assertEq(label, actual, expected) {
  assert(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const CASE_ID    = new mongoose.Types.ObjectId();
const OFFICER_ID = new mongoose.Types.ObjectId();
const EV_ID_1    = uuidv4();
const REQ_ID_1   = uuidv4();
const ENTRY_ID_1 = uuidv4();
const ENTRY_ID_2 = uuidv4();

async function seed() {
  await DiaryEntry.create([
    { case_id: CASE_ID, entry_id: ENTRY_ID_1, actor: { type: 'officer', id: OFFICER_ID.toString() },
      event_type: 'complaint_filed', payload: { note: 'UPI fraud ₹50k' }, ref_ids: {} },
    { case_id: CASE_ID, entry_id: ENTRY_ID_2, actor: { type: 'system', id: 'orchestrator' },
      event_type: 'analysis_run', payload: {}, ref_ids: { snapshot_id: 'snap-001' } },
  ]);

  await CaseChecklist.create([
    { case_id: CASE_ID, sop_id: 'SOP_001', step_id: 'step_A', title: 'Collect statement',
      status: 'completed', criticality: 'high', required_evidence: ['statement'],
      proof_evidence_ids: [EV_ID_1] },
    { case_id: CASE_ID, sop_id: 'SOP_001', step_id: 'step_B', title: 'Request CDR',
      status: 'blocked', criticality: 'high', required_evidence: ['CDR'],
      locked_by_request_id: REQ_ID_1 },
    { case_id: CASE_ID, sop_id: 'SOP_001', step_id: 'step_C', title: 'Victim interview',
      status: 'pending', criticality: 'medium', required_evidence: [] },
  ]);

  await CaseEntity.create([
    { case_id: CASE_ID, entity_type: 'phone', value: '+919876543210',
      first_seen_entry_id: ENTRY_ID_1, corroborating_evidence_ids: [] },
    { case_id: CASE_ID, entity_type: 'upi', value: 'suspect@upi',
      first_seen_entry_id: ENTRY_ID_1, corroborating_evidence_ids: [EV_ID_1] },
  ]);

  await Evidence.create({
    case_id: CASE_ID, evidence_id: EV_ID_1, type: 'document', storage_ref: 'cloudinary/doc1',
    ai_description: 'Complainant written statement', ai_tags: ['statement', 'victim'],
    uploader_id: OFFICER_ID, status: 'verified',
  });

  await DepartmentRequest.create({
    case_id: CASE_ID, request_id: REQ_ID_1, step_id: 'step_B',
    department_entity_id: 'dept_airtel_001',
    draft_content: 'CDR request for +919876543210',
    status: 'sent', sent_at: new Date('2024-01-10'),
  });
}

async function cleanup() {
  await DiaryEntry.collection.deleteMany({ case_id: CASE_ID });
  await CaseChecklist.collection.deleteMany({ case_id: CASE_ID });
  await CaseEntity.collection.deleteMany({ case_id: CASE_ID });
  await Evidence.collection.deleteMany({ case_id: CASE_ID });
  await DepartmentRequest.collection.deleteMany({ case_id: CASE_ID });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function run() {
  const uri = process.env.MONGODB_URI || process.argv[2];
  if (!uri) throw new Error('MONGODB_URI is not set — add it to .env or pass as argument: node scripts/test-facts-assembly.js <mongo_uri>');


  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  await seed();
  const facts = await buildFactsObject(CASE_ID.toString());

  console.log('══ Shape Assertions ══════════════════════════════════════');

  // meta
  assert('meta.case_id is present', facts.meta.case_id === CASE_ID.toString());
  assert('meta.assembled_at is a Date', facts.meta.assembled_at instanceof Date);

  // checklist summary
  const cs = facts.checklist.summary;
  assertEq('checklist.summary.total',       cs.total,       3);
  assertEq('checklist.summary.completed',   cs.completed,   1);
  assertEq('checklist.summary.blocked',     cs.blocked,     1);
  assertEq('checklist.summary.pending',     cs.pending,     1);
  assertEq('checklist.summary.in_progress', cs.in_progress, 0);
  assertEq('checklist.summary.completion_pct', cs.completion_pct, 33);
  assertEq('checklist.summary.high_criticality_pending', cs.high_criticality_pending, 1); // step_B blocked+high

  // checklist steps
  assert('checklist has 3 steps', facts.checklist.steps.length === 3);
  const stepB = facts.checklist.steps.find(s => s.step_id === 'step_B');
  assert('step_B exists', !!stepB);
  assertEq('step_B.status',               stepB.status,               'blocked');
  assertEq('step_B.locked_by_request_id', stepB.locked_by_request_id, REQ_ID_1);

  // entities
  assert('entities.raw has 2 items', facts.entities.raw.length === 2);
  assert('entities.by_type.phone exists', Array.isArray(facts.entities.by_type.phone));
  assertEq('entities.by_type.phone[0]', facts.entities.by_type.phone[0], '+919876543210');
  assert('entities.by_type.upi exists',  Array.isArray(facts.entities.by_type.upi));
  const upiEntity = facts.entities.raw.find(e => e.entity_type === 'upi');
  assert('upi entity has corroborating_evidence_ids', upiEntity.corroborating_evidence_ids.includes(EV_ID_1));

  // evidence
  assertEq('evidence.summary.total',    facts.evidence.summary.total,    1);
  assertEq('evidence.summary.verified', facts.evidence.summary.verified, 1);
  assertEq('evidence.summary.pending',  facts.evidence.summary.pending,  0);
  const ev1 = facts.evidence.items[0];
  assert('evidence item has evidence_id', ev1.evidence_id === EV_ID_1);
  assertEq('evidence item status', ev1.status, 'verified');
  assert('evidence ai_tags is array', Array.isArray(ev1.ai_tags));

  // department requests
  assertEq('request summary.sent', facts.department_requests.summary.sent, 1);
  assertEq('request items length', facts.department_requests.items.length, 1);
  assertEq('request item status', facts.department_requests.items[0].status, 'sent');
  assert('request item has request_id', facts.department_requests.items[0].request_id === REQ_ID_1);

  // recent diary — chronological order (oldest first)
  assert('recent_diary has 2 entries', facts.recent_diary.length === 2);
  assertEq('diary[0].event_type', facts.recent_diary[0].event_type, 'complaint_filed');
  assertEq('diary[1].event_type', facts.recent_diary[1].event_type, 'analysis_run');
  assert('diary entries have actor.type', !!facts.recent_diary[0].actor.type);

  // Print the final facts object for visual inspection
  console.log('\n══ facts_object (condensed) ══════════════════════════════');
  console.log(JSON.stringify({
    meta:    facts.meta,
    checklist_summary: facts.checklist.summary,
    entity_types: Object.keys(facts.entities.by_type),
    evidence_summary: facts.evidence.summary,
    request_summary: facts.department_requests.summary,
    diary_event_types: facts.recent_diary.map(d => d.event_type),
  }, null, 2));

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ════════════════`);

  await cleanup();
  await mongoose.disconnect();

  if (failed > 0) process.exit(1);
}

run().catch((err) => { console.error('Fatal:', err); process.exit(1); });
