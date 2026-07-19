require('dotenv').config();
const mongoose = require('mongoose');
const { Complaint } = require('../dist/modules/complaint/models/Complaint.model');
const { Officer } = require('../dist/modules/police/models/Officer.model');
const { CaseChecklist } = require('../dist/modules/investigation/models/CaseChecklist.model');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

async function seedData() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crime-os');
  
  // 1a. Create Police Station
  const PoliceStationSchema = new mongoose.Schema({ name: String, code: String, city: String, district: String, state: String }, { strict: false });
  const PoliceStation = mongoose.models.PoliceStation || mongoose.model('PoliceStation', PoliceStationSchema);
  let station = await PoliceStation.findOne({ code: 'TS-01' });
  if (!station) {
    station = await PoliceStation.create({ name: 'Test Station', code: 'TS-01', city: 'Test City', district: 'Test District', state: 'Gujarat' });
  }

  // 1. Create IO
  let io = await Officer.findOne({ email: 'io@police.gov.in' });
  if (!io) {
    const passwordHash = await bcrypt.hash('password123', 10);
    io = await Officer.create({
      officerName: 'Test IO',
      badgeNumber: 'IO-999',
      email: 'io@police.gov.in',
      phone: '1234567890',
      role: 'IO',
      policeStation: station._id,
      isActive: true,
      password: passwordHash
    });
  }

  // 1b. Create Citizen
  const { User } = require('../dist/modules/user/models/User.model');
  let citizenUser = await User.findOne({ username: 'rakesh' });
  if (!citizenUser) {
    citizenUser = await User.create({
      firstName: 'Rakesh',
      lastName: 'Patel',
      email: 'rakesh@test.com',
      phone: '9876543210',
      password: 'password123',
      username: 'rakesh',
      dateOfBirth: new Date('1985-01-01'),
      gender: 'MALE',
      address: '456 Test St',
      city: 'Test City',
      district: 'Test District',
      state: 'Gujarat',
      pincode: '380001',
      idProofType: 'AADHAAR',
      idProofNumber: '098765432109',
      securityQuestion: 'What is your pet name?',
      securityAnswer: 'Dog',
      isEmailVerified: true
    });
  }

  // 2. Read JSON
  const dataPath = path.join(__dirname, '../../sample-case-digital-arrest-fraud.json');
  const cyberCaseData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  // 3. Create Case
  let complaint = await Complaint.findOne({ complaintNumber: cyberCaseData.case_id });
  if (!complaint) {
    complaint = await Complaint.create({
      complaintNumber: cyberCaseData.case_id,
      code: cyberCaseData.case_id,
      citizen: citizenUser._id,
      incidentPlace: 'Online',
      category: 'CYBERCRIME',
      incidentDate: new Date('2026-07-15'),
      shortDescription: cyberCaseData.title,
      detailedDescription: cyberCaseData.complaint_summary,
      policeStation: station._id,
      status: 'ASSIGNED_TO_IO',
      assignedIO: io._id,
      descriptionHistory: [],
      crimeSummaryHistory: [{
        version: 1,
        editedBy: 'IO',
        editorId: io._id.toString(),
        content: cyberCaseData.complaint_summary,
        timestamp: new Date()
      }],
      legalSectionsHistory: [{
        version: 1,
        editedBy: 'IO',
        editorId: io._id.toString(),
        content: 'BNS Section 318 (Cheating), Section 319 (Cheating by personation), IT Act Section 66C (Identity theft), Section 66D (Cheating by personation using computer resource)',
        timestamp: new Date()
      }],
      investigationNotesHistory: [],
      evidence: [],
      timeline: [{ user: 'System', description: 'Complaint Filed', timestamp: new Date() }]
    });
  }

  // 4. Create Checklist
  const existingSteps = await CaseChecklist.find({ case_id: complaint._id });
  if (existingSteps.length === 0) {
    const checklistDocs = cyberCaseData.seed_checklist.map(step => ({
      case_id: complaint._id,
      sop_id: cyberCaseData.sop_id,
      step_id: step.step_id,
      title: step.step_id.replace(/_/g, ' '),
      status: step.status,
      criticality: step.criticality,
      required_evidence: step.proof_evidence_ids || [],
      proof_evidence_ids: step.status === 'completed' ? (step.proof_evidence_ids || []) : []
    }));
    await CaseChecklist.insertMany(checklistDocs);
  }

  // 5. Seed real-world Evidence items
  const EvidenceSchema = new mongoose.Schema({
    case_id: mongoose.Schema.Types.ObjectId,
    evidence_id: String,
    type: String,
    storage_ref: String,
    ai_description: String,
    ai_tags: [String],
    uploader_id: mongoose.Schema.Types.ObjectId,
    status: String,
  }, { strict: false, timestamps: true });
  const Evidence = mongoose.models.Evidence || mongoose.model('Evidence', EvidenceSchema);

  const existingEvidence = await Evidence.find({ case_id: complaint._id });
  if (existingEvidence.length === 0) {
    const evidenceDocs = cyberCaseData.evidence.map(ev => ({
      case_id: complaint._id,
      evidence_id: ev.evidence_id,
      type: ev.type,
      storage_ref: `seed/${ev.evidence_id}.${ev.type === 'screen_recording' ? 'mp4' : ev.type === 'audio' ? 'mp3' : ev.type === 'document' ? 'pdf' : 'png'}`,
      ai_description: ev.ai_description,
      ai_tags: ev.ai_tags,
      uploader_id: io._id,
      status: 'verified',
    }));

    // Add a physical evidence item
    evidenceDocs.push({
      case_id: complaint._id,
      evidence_id: 'EV-PHYS-001',
      type: 'physical_device',
      storage_ref: 'none',
      ai_description: 'Seized iPhone 13 Pro Max from the suspect, suspected to have been used to make the WhatsApp video call.',
      ai_tags: ['mobile_device', 'seized_property', 'physical'],
      uploader_id: io._id,
      status: 'verified',
      is_physical: true,
      current_location: 'malkhana',
      custody_chain: [
        {
          timestamp: new Date(),
          from_entity: 'IO Test IO',
          to_entity: 'malkhana',
          status: 'received',
          notes: 'Deposited into evidence locker immediately after seizure.'
        }
      ]
    });

    await Evidence.insertMany(evidenceDocs);
    console.log(`✅ Seeded ${evidenceDocs.length} evidence items`);
  } else {
    console.log(`ℹ️  Evidence already exists (${existingEvidence.length} items)`);
  }

  console.log('\n✅ Seed complete!');
  console.log('Case ID:', complaint._id);
  console.log('URL: http://localhost:3000/police/dashboard/complaints/' + complaint._id);
  
  process.exit(0);
}

seedData().catch(console.error);
