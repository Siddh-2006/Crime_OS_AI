/**
 * Investigation module seed + test script.
 * Run from backend/: node scripts/seed-investigation.js
 *
 * What it does:
 *  1. Connects to MongoDB
 *  2. Seeds: 1 diary entry (complaint_filed), 2 checklist items, 1 case entity, 1 dept request, 1 snapshot, 1 escalation
 *  3. Reads back each doc and prints it for visual inspection
 *  4. Attempts to UPDATE a diary entry — MUST throw (append-only enforcement)
 *  5. Cleans up seeded docs at the end
 */

'use strict';

require('dotenv').config();   // loads backend/.env automatically
const mongoose = require('mongoose');

const { v4: uuidv4 } = require('uuid');

// ─── Inline schema definitions (mirrors TypeScript models exactly) ─────────────

const DiaryEntrySchema = new mongoose.Schema(
  {
    case_id:    { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    entry_id:   { type: String, required: true, unique: true },
    timestamp:  { type: Date, default: Date.now, required: true },
    actor: {
      type: { type: String, enum: ['officer', 'system', 'department'], required: true },
      id:   { type: String, required: true },
    },
    event_type: {
      type: String,
      enum: [
        'complaint_filed','evidence_added','checklist_step_completed','request_drafted',
        'request_sent','response_received','analysis_run','suggestion_generated',
        'officer_note','manual_step_added','override_correction','escalation_raised',
      ],
      required: true,
    },
    payload:  { type: mongoose.Schema.Types.Mixed, default: {} },
    ref_ids:  {
      evidence_id: String, request_id: String, step_id: String, snapshot_id: String,
    },
  },
  { versionKey: false },
);
// Append-only enforcement
DiaryEntrySchema.pre(['updateOne','findOneAndUpdate','findOneAndDelete','deleteOne','deleteMany'], function () {
  throw new Error('DiaryEntry is append-only. Updates and deletes are not permitted.');
});

const CaseChecklistSchema = new mongoose.Schema(
  {
    case_id:    { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    sop_id:     { type: String, required: true },
    step_id:    { type: String, required: true },
    title:      { type: String, required: true },
    status:     { type: String, enum: ['pending','blocked','in_progress','completed'], default: 'pending' },
    criticality:{ type: String, enum: ['high','medium','low'], required: true },
    required_evidence:  [String],
    proof_evidence_ids: [String],
    locked_by_request_id: String,
    completed_by: mongoose.Schema.Types.ObjectId,
    completed_at: Date,
  },
  { timestamps: true, versionKey: false },
);

const CaseEntitySchema = new mongoose.Schema(
  {
    case_id:               { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    entity_type:           { type: String, required: true },
    value:                 { type: String, required: true },
    first_seen_entry_id:   { type: String, required: true },
    corroborating_evidence_ids: [String],
  },
  { timestamps: true, versionKey: false },
);

const DepartmentRequestSchema = new mongoose.Schema(
  {
    case_id:              { type: mongoose.Schema.Types.ObjectId, required: true },
    request_id:           { type: String, required: true, unique: true },
    step_id:              { type: String, required: true },
    department_entity_id: { type: String, required: true },
    draft_content:        { type: String, required: true },
    attachments:          [String],
    status:               { type: String, enum: ['draft','reviewed','sent','acknowledged','response_received','overdue'], default: 'draft' },
    sent_via:    String, sent_at: Date, response_ref: String, response_at: Date,
  },
  { timestamps: true, versionKey: false },
);

const AnalysisSnapshotSchema = new mongoose.Schema(
  {
    case_id:      { type: mongoose.Schema.Types.ObjectId, required: true },
    snapshot_id:  { type: String, required: true, unique: true },
    timestamp:    { type: Date, default: Date.now },
    trigger:      { type: String, enum: ['manual','auto_on_response','officer_override'], required: true },
    facts_used:   mongoose.Schema.Types.Mixed,
    ranked_next_steps:  [{ step_id: String, reason: String, confidence: Number, evidence_needed: [String], _id: false }],
    suspect_candidates: [{ entity: String, confidence: Number, supporting_evidence_ids: [String], contradicting_evidence_ids: [String], _id: false }],
    narrative_summary:  { type: String, required: true },
    confidence_breakdown: mongoose.Schema.Types.Mixed,
    officer_authored: { type: Boolean, default: false },
    parent_snapshot_id: String,
  },
  { versionKey: false },
);

const EscalationSchema = new mongoose.Schema(
  {
    case_id:       { type: mongoose.Schema.Types.ObjectId, required: true },
    escalation_id: { type: String, required: true, unique: true },
    reason:        { type: String, required: true },
    triggered_at:  { type: Date, default: Date.now },
    summary:       { type: String, required: true },
    sent_to:       { type: String, required: true },
    status:        { type: String, enum: ['pending','sent','resolved'], default: 'pending' },
  },
  { timestamps: true, versionKey: false },
);

// Register models
const DiaryEntry       = mongoose.model('DiaryEntry',       DiaryEntrySchema);
const CaseChecklist    = mongoose.model('CaseChecklist',    CaseChecklistSchema);
const CaseEntity       = mongoose.model('CaseEntity',       CaseEntitySchema);
const DeptRequest      = mongoose.model('DepartmentRequest',DepartmentRequestSchema);
const AnalysisSnapshot = mongoose.model('AnalysisSnapshot', AnalysisSnapshotSchema);
const Escalation       = mongoose.model('Escalation',       EscalationSchema);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_CASE_ID   = new mongoose.Types.ObjectId();
const FAKE_OFFICER   = new mongoose.Types.ObjectId();
const ENTRY_ID_1     = uuidv4();
const STEP_ID_1      = 'step_001';
const STEP_ID_2      = 'step_002';
const SNAPSHOT_ID    = uuidv4();
const REQUEST_ID     = uuidv4();
const ESCALATION_ID  = uuidv4();

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(` ${title}`);
  console.log('═'.repeat(60));
}

function pretty(label, doc) {
  console.log(`\n  ── ${label} ──`);
  console.log(JSON.stringify(doc, null, 2).split('\n').map(l => '  ' + l).join('\n'));
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set — check your .env file');

  await mongoose.connect(uri);
  console.log(`Connected to MongoDB: ${uri}`);

  // Track seeded IDs for cleanup
  const seededIds = {
    diary: [], checklist: [], entity: [], request: [], snapshot: [], escalation: [],
  };

  try {
    // ── 1. Diary Entry ───────────────────────────────────────────────────────
    section('Test 1: Insert DiaryEntry (complaint_filed)');
    const diary1 = await DiaryEntry.create({
      case_id:    FAKE_CASE_ID,
      entry_id:   ENTRY_ID_1,
      actor:      { type: 'officer', id: FAKE_OFFICER.toString() },
      event_type: 'complaint_filed',
      payload:    { complaint_number: 'CMP-2024-001', station_code: 'AHM001' },
      ref_ids:    {},
    });
    seededIds.diary.push(diary1._id);
    pretty('Inserted DiaryEntry', diary1.toObject());
    console.log('  PASS ✅');

    // ── 2. Checklist Items ───────────────────────────────────────────────────
    section('Test 2: Insert CaseChecklist items');
    const ch1 = await CaseChecklist.create({
      case_id:    FAKE_CASE_ID,
      sop_id:     'SOP_CYBER_FRAUD_001',
      step_id:    STEP_ID_1,
      title:      'Collect complainant statement',
      criticality:'high',
      required_evidence: ['Written statement', 'ID proof'],
    });
    const ch2 = await CaseChecklist.create({
      case_id:    FAKE_CASE_ID,
      sop_id:     'SOP_CYBER_FRAUD_001',
      step_id:    STEP_ID_2,
      title:      'Send CDR request to telecom',
      criticality:'medium',
      required_evidence: ['Accused phone number'],
    });
    seededIds.checklist.push(ch1._id, ch2._id);
    pretty('Checklist item 1', ch1.toObject());
    pretty('Checklist item 2', ch2.toObject());
    console.log('\n  PASS ✅');

    // ── 3. CaseEntity ────────────────────────────────────────────────────────
    section('Test 3: Insert CaseEntity');
    const entity1 = await CaseEntity.create({
      case_id:             FAKE_CASE_ID,
      entity_type:         'phone',
      value:               '+919876543210',
      first_seen_entry_id: ENTRY_ID_1,
      corroborating_evidence_ids: [],
    });
    seededIds.entity.push(entity1._id);
    pretty('Inserted CaseEntity', entity1.toObject());
    console.log('  PASS ✅');

    // ── 4. DepartmentRequest ─────────────────────────────────────────────────
    section('Test 4: Insert DepartmentRequest');
    const req1 = await DeptRequest.create({
      case_id:              FAKE_CASE_ID,
      request_id:           REQUEST_ID,
      step_id:              STEP_ID_2,
      department_entity_id: 'dept_airtel_001',
      draft_content:        'Request for CDR of +919876543210 from 2024-01-01 to 2024-01-15',
      status:               'draft',
    });
    seededIds.request.push(req1._id);
    pretty('Inserted DepartmentRequest', req1.toObject());
    console.log('  PASS ✅');

    // ── 5. AnalysisSnapshot ──────────────────────────────────────────────────
    section('Test 5: Insert AnalysisSnapshot');
    const snap1 = await AnalysisSnapshot.create({
      case_id:     FAKE_CASE_ID,
      snapshot_id: SNAPSHOT_ID,
      trigger:     'manual',
      facts_used:  { known_entities: ['+919876543210'], sop_progress: '1/2' },
      ranked_next_steps: [
        { step_id: STEP_ID_2, reason: 'CDR needed to identify call tower', confidence: 0.87, evidence_needed: ['CDR records'] },
      ],
      suspect_candidates: [
        { entity: '+919876543210', confidence: 0.65, supporting_evidence_ids: [], contradicting_evidence_ids: [] },
      ],
      narrative_summary:   'Victim received a fraudulent UPI collect request. Accused phone identified.',
      confidence_breakdown: { sop_coverage: 0.5, evidence_quality: 0.6 },
    });
    seededIds.snapshot.push(snap1._id);
    pretty('Inserted AnalysisSnapshot', snap1.toObject());
    console.log('  PASS ✅');

    // ── 6. Escalation ────────────────────────────────────────────────────────
    section('Test 6: Insert Escalation');
    const esc1 = await Escalation.create({
      case_id:       FAKE_CASE_ID,
      escalation_id: ESCALATION_ID,
      reason:        'No CDR response after 7 days',
      summary:       'Telecom department has not responded to CDR request. Case stalled.',
      sent_to:       'DSP-AHM-01',
    });
    seededIds.escalation.push(esc1._id);
    pretty('Inserted Escalation', esc1.toObject());
    console.log('  PASS ✅');

    // ── 7. Query all by case_id ──────────────────────────────────────────────
    section('Test 7: Query all collections by case_id');
    const allDiary    = await DiaryEntry.find({ case_id: FAKE_CASE_ID });
    const allChecklist = await CaseChecklist.find({ case_id: FAKE_CASE_ID });
    const allEntities  = await CaseEntity.find({ case_id: FAKE_CASE_ID });
    const allRequests  = await DeptRequest.find({ case_id: FAKE_CASE_ID });
    const allSnapshots = await AnalysisSnapshot.find({ case_id: FAKE_CASE_ID });
    const allEscalations = await Escalation.find({ case_id: FAKE_CASE_ID });

    console.log(`\n  diary_entries       : ${allDiary.length} doc(s) ✅`);
    console.log(`  case_checklist      : ${allChecklist.length} doc(s) ✅`);
    console.log(`  case_entities       : ${allEntities.length} doc(s) ✅`);
    console.log(`  department_requests : ${allRequests.length} doc(s) ✅`);
    console.log(`  analysis_snapshots  : ${allSnapshots.length} doc(s) ✅`);
    console.log(`  escalations         : ${allEscalations.length} doc(s) ✅`);

    // ── 8. Checklist findByStatus ────────────────────────────────────────────
    section('Test 8: findByStatus (pending)');
    const pending = await CaseChecklist.find({ case_id: FAKE_CASE_ID, status: 'pending' });
    console.log(`  pending steps found: ${pending.length} (expected: 2) ${pending.length === 2 ? '✅' : '❌'}`);

    // ── 9. Append-only enforcement ───────────────────────────────────────────
    section('Test 9: Attempt DiaryEntry UPDATE — must THROW ❌');
    try {
      await DiaryEntry.findOneAndUpdate(
        { entry_id: ENTRY_ID_1 },
        { event_type: 'officer_note' },
      );
      console.log('  FAIL ❌ — update did NOT throw! Append-only enforcement broken.');
    } catch (err) {
      console.log(`  Caught expected error: "${err.message}"`);
      if (err.message.includes('append-only')) {
        console.log('  PASS ✅ — DiaryEntry is correctly append-only');
      } else {
        console.log(`  UNEXPECTED error type ❌ — ${err.message}`);
      }
    }

    // ── 10. Append-only — deleteOne ──────────────────────────────────────────
    section('Test 10: Attempt DiaryEntry DELETE — must THROW ❌');
    try {
      await DiaryEntry.deleteOne({ entry_id: ENTRY_ID_1 });
      console.log('  FAIL ❌ — delete did NOT throw!');
    } catch (err) {
      console.log(`  Caught expected error: "${err.message}"`);
      if (err.message.includes('append-only')) {
        console.log('  PASS ✅ — DiaryEntry delete correctly blocked');
      } else {
        console.log(`  UNEXPECTED error type ❌`);
      }
    }

  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────────
    section('Cleanup');
    // Direct deleteMany bypasses pre-hook (this is what admin cleanup scripts would do via .collection)
    await DiaryEntry.collection.deleteMany({ case_id: FAKE_CASE_ID });
    await CaseChecklist.collection.deleteMany({ case_id: FAKE_CASE_ID });
    await CaseEntity.collection.deleteMany({ case_id: FAKE_CASE_ID });
    await DeptRequest.collection.deleteMany({ case_id: FAKE_CASE_ID });
    await AnalysisSnapshot.collection.deleteMany({ case_id: FAKE_CASE_ID });
    await Escalation.collection.deleteMany({ case_id: FAKE_CASE_ID });
    console.log('  Test documents removed from all collections.');

    await mongoose.disconnect();
    console.log('\nDone.');
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
