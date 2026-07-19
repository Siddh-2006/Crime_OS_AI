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
  // Since User was replaced by Officer import, we need to import User again.
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
  const dataPath = path.join(__dirname, '../../test-cases-sample-data.json');
  const jsonData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const cyberCaseData = jsonData.cases.find(c => c.case_id === 'TEST-CYBER-001');

  // 3. Create Case
  let complaint = await Complaint.findOne({ complaintNumber: 'TEST-CYBER-001' });
  if (!complaint) {
    complaint = await Complaint.create({
      complaintNumber: 'TEST-CYBER-001',
      code: 'TEST-CYBER-001',
      citizen: citizenUser._id,
      incidentPlace: 'Online',
      category: 'CYBERCRIME',
      incidentDate: new Date('2026-07-12'),
      shortDescription: 'Rs. 48,000 debited from account via unauthorized UPI collect request.',
      detailedDescription: cyberCaseData.complaint_summary,
      policeStation: station._id,
      status: 'ASSIGNED_TO_IO',
      assignedIO: io._id,
      descriptionHistory: [],
      crimeSummaryHistory: [{
        version: 1,
        editedBy: 'System',
        editorId: io._id.toString(),
        content: 'Complainant Rakesh Patel lost Rs. 48,000 via a phishing UPI collect request disguised as a KYC update from his bank. Amount was routed through mule accounts to VPA unknownsender@fakebank.',
        timestamp: new Date()
      }],
      legalSectionsHistory: [{
        version: 1,
        editedBy: 'System',
        editorId: io._id.toString(),
        content: 'BNS Section 318 (Cheating), Section 319 (Cheating by personation), IT Act Section 66C (Identity theft), Section 66D (Cheating by personation using computer resource)',
        timestamp: new Date()
      }],
      investigationNotesHistory: [{
        version: 1,
        editedBy: 'System',
        editorId: io._id.toString(),
        content: 'Initial analysis identifies VPA unknownsender@fakebank as primary suspect. HDFC Bank fund hold notice sent. CDR trace for SMS sender underway. KYC for mule account at Axis Bank requested.',
        timestamp: new Date()
      }],
      evidence: [],
      timeline: [{ user: 'System', description: 'Complaint Filed', timestamp: new Date() }]
    });
  } else {
    // Update existing case with richer data
    await Complaint.updateOne({ _id: complaint._id }, {
      $set: {
        'crimeSummaryHistory': [{
          version: 1, editedBy: 'System', editorId: io._id.toString(),
          content: 'Complainant Rakesh Patel lost Rs. 48,000 via a phishing UPI collect request disguised as a KYC update from his bank. Amount routed through mule accounts.',
          timestamp: new Date()
        }],
        'legalSectionsHistory': [{
          version: 1, editedBy: 'System', editorId: io._id.toString(),
          content: 'BNS Section 318 (Cheating), Section 319 (Cheating by personation), IT Act Section 66C (Identity theft), Section 66D (Cheating by personation using computer resource)',
          timestamp: new Date()
        }]
      }
    });
  }

  // 4. Create Checklist
  const existingSteps = await CaseChecklist.find({ case_id: complaint._id });
  if (existingSteps.length === 0) {
    const checklistDocs = cyberCaseData.seed_checklist.map(step => {
      // Map automated vs manual steps
      // Automated steps (via portal): require external departments
      let department_entity_id = undefined;
      if (step.step_id === 'telecom_cdr_request') department_entity_id = 'DEPT-NODAL-001';
      if (step.step_id === 'kyc_request' || step.step_id === 'fund_hold_notice') department_entity_id = 'DEPT-BANK-001';

      // Required proof for manual/automated completion
      let required_evidence = [];
      if (step.step_id === 'kyc_request') required_evidence = ['kyc_doc'];
      if (step.step_id === 'layer2_transaction_trace') required_evidence = ['transaction_log'];
      if (step.step_id === 'telecom_cdr_request') required_evidence = ['cdr'];

      return {
        case_id: complaint._id,
        sop_id: 'SOP-CYBER-01',
        step_id: step.step_id,
        title: step.step_id.replace(/_/g, ' '),
        status: step.status,
        criticality: step.criticality,
        required_evidence,
        department_entity_id,
        proof_evidence_ids: []
      };
    });
    
    // Add citizen request step
    checklistDocs.push({
      case_id: complaint._id,
      sop_id: 'SOP-CYBER-01',
      step_id: 'request_clear_cctv_footage',
      title: 'Request clearer CCTV footage from victim',
      status: 'pending',
      criticality: 'medium',
      required_evidence: ['cctv_footage'],
      target: 'complainant',
      proof_evidence_ids: []
    });

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
    const evidenceDocs = [
      {
        case_id: complaint._id,
        evidence_id: 'EV-CYBER-001-01',
        type: 'bank_statement',
        storage_ref: 'seed/bank_statement_rakesh_patel_july2026.pdf',
        ai_description: 'HDFC Bank account statement for July 2026 showing Rs. 48,000 debit at 14:32 IST on 12-Jul-2026. Payee VPA: unknownsender@fakebank. Transaction ref: UPI/123456789/2026.',
        ai_tags: ['bank_statement', 'upi_transaction', 'HDFC', 'debit', 'Rs48000'],
        uploader_id: io._id,
        status: 'verified',
      },
      {
        case_id: complaint._id,
        evidence_id: 'EV-CYBER-001-02',
        type: 'cdr',
        storage_ref: 'seed/cdr_rakesh_9876543210_july12.pdf',
        ai_description: 'Call Detail Record (CDR) for complainant mobile 9876543210 on 12-Jul-2026. Shows SMS received at 14:28 IST from virtual number +91-9999000123 containing phishing link bit.ly/kyc-hdfc.',
        ai_tags: ['cdr', 'sms', 'phishing_link', 'sender_number', 'telecom'],
        uploader_id: io._id,
        status: 'verified',
      },
      {
        case_id: complaint._id,
        evidence_id: 'EV-CYBER-001-03',
        type: 'kyc_document',
        storage_ref: 'seed/mule_account_kyc_axis_bank.pdf',
        ai_description: 'KYC documents for Axis Bank account linked to VPA unknownsender@fakebank. Account opened with forged Aadhaar under name "Suresh Kumar" on 15-Jun-2026, 27 days before fraud. Account now has zero balance — funds transferred to 3 further accounts.',
        ai_tags: ['kyc', 'mule_account', 'Axis_Bank', 'forged_aadhaar', 'money_mule'],
        uploader_id: io._id,
        status: 'verified',
      },
      {
        case_id: complaint._id,
        evidence_id: 'EV-CYBER-001-04',
        type: 'transaction_log',
        storage_ref: 'seed/upi_transaction_trace_layer2.json',
        ai_description: 'Layer-2 UPI transaction trace from NPCI. Rs. 48,000 split into 3 transfers: Rs. 20,000 → SBI account 9988776655, Rs. 15,000 → PNB account 7766554433, Rs. 13,000 → Paytm wallet 8800112233. All accounts flagged as mule accounts in previous fraud cases.',
        ai_tags: ['transaction_trace', 'NPCI', 'layer2', 'money_laundering', 'mule_network'],
        uploader_id: io._id,
        status: 'verified',
      },
      {
        case_id: complaint._id,
        evidence_id: 'EV-CYBER-001-05',
        type: 'screenshot',
        storage_ref: 'seed/phishing_sms_screenshot.png',
        ai_description: 'Screenshot of phishing SMS received by complainant. Message reads: "Dear HDFC customer, your KYC is incomplete. Complete now to avoid account suspension: bit.ly/kyc-hdfc Your OTP: DO NOT SHARE". Link resolves to 192.168.x.x (spoofed banking page hosted on compromised server in Rajasthan.',
        ai_tags: ['phishing_sms', 'screenshot', 'spoofed_url', 'social_engineering', 'otp_fraud'],
        uploader_id: io._id,
        status: 'pending',
      },
    ];
    await Evidence.insertMany(evidenceDocs);
    console.log('✅ Seeded 5 evidence items');
  } else {
    console.log(`ℹ️  Evidence already exists (${existingEvidence.length} items)`);
  }

  console.log('\n✅ Seed complete!');
  console.log('IO Credentials:');
  console.log('Email:', io.email);
  console.log('Password: password123');
  console.log('\nCase ID:', complaint._id);
  console.log('URL: http://localhost:3000/police/dashboard/complaints/' + complaint._id);
  
  process.exit(0);
}

seedData().catch(console.error);
