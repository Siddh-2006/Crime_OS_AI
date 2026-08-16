import mongoose from 'mongoose';

import { v4 as uuidv4 } from 'uuid';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { InvestigationOrchestrator } from '../modules/investigation/services/investigationOrchestrator';

const IO = new mongoose.Types.ObjectId('6a5b60a5774e86b7dd85ca7a');
const PS = new mongoose.Types.ObjectId('6a7b48ec7f0f1195f56fcf0d');
const CIT = new mongoose.Types.ObjectId('6a5b60a5774e86b7dd85ca7d');

async function seedCaseA() {
  const c1 = new mongoose.Types.ObjectId();
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB not connected');

  const p1 = new mongoose.Types.ObjectId();
  const p2 = new mongoose.Types.ObjectId();

  await db.collection('evidences').insertMany([
    { _id: new mongoose.Types.ObjectId(), case_id: c1, evidence_id: uuidv4(), type: 'statement', status: 'verified', uploader_id: IO, relatedParticipantIds: [p1] },
    { _id: new mongoose.Types.ObjectId(), case_id: c1, evidence_id: uuidv4(), type: 'document', status: 'verified', uploader_id: IO, relatedParticipantIds: [p2] }
  ]);
  
  await db.collection('caseparticipants').insertMany([
    { _id: p1, case_id: c1, participant_id: uuidv4(), name: 'John Doe', roles: ['Suspect'], approved: true, identifiers: [{ type: 'phone', value: '555-1000' }], statements: [], reasoning: [] },
    { _id: p2, case_id: c1, participant_id: uuidv4(), name: 'Jane Smith', roles: ['Suspect'], approved: true, identifiers: [{ type: 'phone', value: '555-1000' }], statements: [], reasoning: [] },
  ]);

  await db.collection('complaints').insertOne({ _id: c1, complaintNumber: 'TEST-CASE-A', citizen: CIT, policeStation: PS, assignedIO: IO, status: 'under_investigation', category: 'fraud', description: 'Financial fraud reported by local business. Two suspects have been identified but they claim they have never met.', createdAt: new Date(), updatedAt: new Date() });
  return c1.toString();
}

async function seedCaseB() {
  const c2 = new mongoose.Types.ObjectId();
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB not connected');

  const p1 = new mongoose.Types.ObjectId();
  
  await db.collection('evidences').insertMany([
    { _id: new mongoose.Types.ObjectId(), case_id: c2, evidence_id: uuidv4(), type: 'photograph', status: 'verified', uploader_id: IO, relatedParticipantIds: [p1] }
  ]);

  await db.collection('caseparticipants').insertMany([
    { _id: p1, case_id: c2, participant_id: uuidv4(), name: 'Mark Loner', roles: ['Suspect'], approved: true, identifiers: [{ type: 'phone', value: '555-2000' }], statements: [], reasoning: [] }
  ]);

  await db.collection('complaints').insertOne({ _id: c2, complaintNumber: 'TEST-CASE-B', citizen: CIT, policeStation: PS, assignedIO: IO, status: 'under_investigation', category: 'theft', description: 'Bicycle stolen from porch. Suspect caught on camera.', createdAt: new Date(), updatedAt: new Date() });
  return c2.toString();
}

async function seedCaseC() {
  const c3 = new mongoose.Types.ObjectId();
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB not connected');

  const e1 = new mongoose.Types.ObjectId();
  const e2 = new mongoose.Types.ObjectId();
  const e3 = new mongoose.Types.ObjectId();
  const ent = new mongoose.Types.ObjectId();

  await db.collection('evidences').insertMany([
    { _id: e1, case_id: c3, evidence_id: uuidv4(), type: 'bank_statement', status: 'verified', uploader_id: IO, relatedParticipantIds: [] },
    { _id: e2, case_id: c3, evidence_id: uuidv4(), type: 'screenshot', status: 'verified', uploader_id: IO, relatedParticipantIds: [] },
    { _id: e3, case_id: c3, evidence_id: uuidv4(), type: 'police_report', status: 'verified', uploader_id: IO, relatedParticipantIds: [] }
  ]);

  await db.collection('caseentities').insertMany([
    { _id: ent, case_id: c3, entity_type: 'bank_account', value: 'SBI-999888', first_seen_entry_id: uuidv4(), corroborating_evidence_ids: [e1.toString(), e2.toString(), e3.toString()] }
  ]);

  await db.collection('complaints').insertOne({ _id: c3, complaintNumber: 'TEST-CASE-C', citizen: CIT, policeStation: PS, assignedIO: IO, status: 'under_investigation', category: 'cyber_crime', description: 'Unknown fraudster scammed victim online.', createdAt: new Date(), updatedAt: new Date() });
  return c3.toString();
}

async function runTest(caseId: string, caseLabel: string) {
  console.log(`\n======================================================================`);
  console.log(`RUNNING TEST: ${caseLabel} (ID: ${caseId})`);
  console.log(`======================================================================\n`);

  console.log(`--- [1] DISABLED GRAPH CONTEXT ---`);
  process.env.DISABLE_GRAPH_CONTEXT = 'true';
  const disabledRes = await InvestigationOrchestrator.runAnalysis(caseId);
  console.log('\nNARRATIVE SUMMARY:\n', disabledRes.narrative_summary);
  console.log('\nPARTICIPANT RECOMMENDATIONS:\n', JSON.stringify(disabledRes.participant_recommendations, null, 2));
  console.log('\nRANKED NEXT STEPS:\n', JSON.stringify(disabledRes.ranked_next_steps, null, 2));

  console.log(`\n--- [2] ENABLED GRAPH CONTEXT ---`);
  process.env.DISABLE_GRAPH_CONTEXT = 'false';
  const enabledRes = await InvestigationOrchestrator.runAnalysis(caseId);
  console.log('\nNARRATIVE SUMMARY:\n', enabledRes.narrative_summary);
  console.log('\nPARTICIPANT RECOMMENDATIONS:\n', JSON.stringify(enabledRes.participant_recommendations, null, 2));
  console.log('\nRANKED NEXT STEPS:\n', JSON.stringify(enabledRes.ranked_next_steps, null, 2));
}

async function main() {
  await connectDatabase();
  console.log('Connected to DB');

  const idA = await seedCaseA();
  const idB = await seedCaseB();
  const idC = await seedCaseC();

  await runTest(idA, 'CASE A (Shared Identifier, No Text Hint)');
  await runTest(idB, 'CASE B (No Meaningful Signal)');
  await runTest(idC, 'CASE C (Multi-Corroborated Entity)');

  await disconnectDatabase();
}

main().catch(e => { console.error(e); process.exit(1); });
