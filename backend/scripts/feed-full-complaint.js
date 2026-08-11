require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

async function seedToUri(mongoUri) {
  console.log(`Connecting to MongoDB at: ${mongoUri}...`);
  try {
    const conn = await mongoose.createConnection(mongoUri).asPromise();
    console.log(`Connected to: ${mongoUri}`);

    // Define Schemas on this connection
    const PoliceStation = conn.model('PoliceStation', new mongoose.Schema({ name: String, code: String, city: String, district: String, state: String }, { strict: false }));
    const User = conn.model('User', new mongoose.Schema({}, { strict: false }));
    const Officer = conn.model('Officer', new mongoose.Schema({}, { strict: false }));
    const Complaint = conn.model('Complaint', new mongoose.Schema({}, { strict: false }));
    const CaseChecklist = conn.model('CaseChecklist', new mongoose.Schema({}, { strict: false }));
    const CaseUnderstanding = conn.model('CaseUnderstanding', new mongoose.Schema({}, { strict: false }));

    // 1. Station
    let station = await PoliceStation.findOne({ code: 'GJ-AHM001' });
    if (!station) {
      station = await PoliceStation.create({
        name: 'Navrangpura Cyber Crime Police Station',
        code: 'GJ-AHM001',
        city: 'Ahmedabad',
        district: 'Ahmedabad City',
        state: 'Gujarat'
      });
    }

    // 2. Bind ALL SHO and IO Officers to this station
    const passwordHash = await bcrypt.hash('password123', 10);
    await Officer.updateMany(
      { email: { $in: ['sho@police.gov.in', 'io@police.gov.in', 'test.sho@police.gov.in', 'test.io@police.gov.in'] } },
      { $set: { policeStation: station._id } }
    );

    let io = await Officer.findOne({ badgeNumber: 'IO-999' });
    if (!io) {
      io = await Officer.create({
        officerName: 'Test IO',
        badgeNumber: 'IO-999',
        email: 'io@police.gov.in',
        phone: '9999999999',
        role: 'IO',
        policeStation: station._id,
        isActive: true,
        password: passwordHash
      });
    }

    let sho = await Officer.findOne({ email: 'sho@police.gov.in' });
    if (!sho) {
      sho = await Officer.create({
        officerName: 'Test SHO',
        badgeNumber: 'SHO-001',
        email: 'sho@police.gov.in',
        phone: '8888888888',
        role: 'SHO',
        policeStation: station._id,
        isActive: true,
        password: passwordHash
      });
    }

    // Update SHO & IO station
    io.policeStation = station._id;
    await io.save();
    sho.policeStation = station._id;
    await sho.save();

    // 3. Citizen
    let citizen = await User.findOne({ email: 'anil.singh@gmail.com' });
    if (!citizen) {
      citizen = await User.create({
        firstName: 'Anil Kumar',
        lastName: 'Singh',
        email: 'anil.singh@gmail.com',
        phone: '9825012345',
        password: passwordHash,
        username: 'anilsingh',
        address: 'B-402, Satellite Towers, Satellite Road, Ahmedabad',
        city: 'Ahmedabad',
        district: 'Ahmedabad City',
        state: 'Gujarat',
        pincode: '380015',
        idProofType: 'AADHAAR',
        idProofNumber: '458923019948',
        isEmailVerified: true
      });
    }

    const complaintNumber = 'GJ-AHM001-2026-8819';
    console.log(`Feeding complaint: ${complaintNumber}...`);

    // Remove existing if any
    await Complaint.deleteMany({ complaintNumber });
    await CaseChecklist.deleteMany({ case_id: complaintNumber });
    await CaseUnderstanding.deleteMany({ case_id: complaintNumber });

  // 4. Create Full Complaint Record
  const newComplaint = await Complaint.create({
    complaintNumber,
    code: complaintNumber,
    citizen: citizen._id,
    policeStation: station._id,
    assignedIO: io._id,
    assignedSHO: sho._id,
    category: 'CYBERCRIME',
    shortDescription: 'Multi-stage Online Stock Investment & Tax Demand Scam involving Rs. 1.95 Crores',
    detailedDescription: `Complainant retired chemical engineer Anil Kumar Singh was lured into a fake WhatsApp stock trading advisory group 'Viking Global INVST c29' in February 2024. 
Suspect operating under alias 'Kiran Kaur' (+91 8269935967) persuaded the complainant to download a fake trading application 'Viking-Indian app' and transfer funds into multiple designated merchant beneficiary accounts across ICICI Bank, HDFC Bank, and Axis Bank.
Over a span of 29 transactions, complainant transferred a total of Rs. 1,95,000,000 (1.95 Crores). When complainant attempted to withdraw Rs. 50,00,000, the fraudsters demanded an additional Rs. 70,00,000 as 'Income Tax & Security Clearance Deposit'. Complainant subsequently realized the fraud and reported to 1930 Cyber Crime Helpline and local police station.`,
    incidentDate: new Date('2026-02-10'),
    incidentTime: 'Morning 10:30 AM',
    incidentPlace: 'Online (WhatsApp & Net Banking from Satellite, Ahmedabad)',
    status: 'FIR_REGISTERED',
    isLocked: true,
    isFirRegistered: true,
    firNumber: 'GJ-AHM-2026-008819',
    firRegisteredAt: new Date('2026-02-20T18:30:00Z'),
    firPdfUrl: 'https://res.cloudinary.com/q9ixw3zp/image/upload/v1723400000/fir_sample.pdf',
    firPdfUrlEn: 'https://res.cloudinary.com/q9ixw3zp/image/upload/v1723400000/fir_sample_en.pdf',
    firPdfUrlGujEn: 'https://res.cloudinary.com/q9ixw3zp/image/upload/v1723400000/fir_sample_guj.pdf',
    
    // Evidence Documents
    evidence: [
      {
        publicId: 'crime-os/evidence/bank_statement_icici_2024.pdf',
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        resourceType: 'raw',
        mimeType: 'application/pdf',
        originalFilename: 'ICICI_Bank_29_Transfers_Statement.pdf',
        extension: 'pdf',
        size: 2450000,
        uploadedBy: citizen._id,
        uploadedAt: new Date('2026-02-15T12:00:00Z'),
        processingStatus: 'PROCESSED',
        applicableSections: [
          { code: 'BSA-63', title: 'Admissibility of Electronic Records in Judicial Proceedings', reason: 'Certified digital bank transaction ledger demonstrating Rs. 1.95 Crore outflow.' }
        ],
        aiMetadata: {
          ocrText: 'ICICI Bank Statement Account No: 002401582910. Total Debits: Rs 1,95,00,000 across 29 IMPS/NEFT transfers to beneficiaries: Alpha Tech Traders, Apex Merchants, Zenith Enterprises.',
          aiSummary: 'Contains certified transaction logs detailing 29 transfers totaling Rs. 1.95 Crore to 3 separate mule accounts.',
          classification: 'Bank Statement',
          classificationConfidence: 0.98
        }
      },
      {
        publicId: 'crime-os/evidence/whatsapp_chat_kiran_kaur.png',
        secureUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        resourceType: 'image',
        mimeType: 'image/png',
        originalFilename: 'WhatsApp_Chat_Screenshot_KiranKaur.png',
        extension: 'png',
        size: 890000,
        uploadedBy: citizen._id,
        uploadedAt: new Date('2026-02-15T12:05:00Z'),
        processingStatus: 'PROCESSED',
        applicableSections: [
          { code: 'BNS-318(4)', title: 'Cheating and dishonestly inducing delivery of property', reason: 'Direct WhatsApp chat logs showing fraudulent promises of 400% stock returns.' }
        ],
        aiMetadata: {
          ocrText: 'Kiran Kaur: "Sir, transfer 70 Lakhs tax now to unfreeze your 50 Lakh profits." Anil Singh: "I have already transferred 1.95 Crores."',
          aiSummary: 'Chat transcript showing extortion demand of Rs 70 Lakh tax before withdrawal release.',
          classification: 'Chat Screenshot',
          classificationConfidence: 0.95
        }
      }
    ],

    // Timeline Audit Trail
    timeline: [
      {
        user: 'Citizen (Anil Kumar Singh)',
        timestamp: new Date('2026-02-15T10:00:00Z'),
        description: 'Online complaint submitted successfully via Cyber Crime Portal.'
      },
      {
        user: 'SHO (Vikramaditya Patel)',
        timestamp: new Date('2026-02-15T14:30:00Z'),
        description: 'Complaint verified and assigned to IO Inspector Rajesh Varma.'
      },
      {
        user: 'IO (Rajesh Varma)',
        timestamp: new Date('2026-02-16T11:00:00Z'),
        description: 'AI Multi-modal analysis pipeline executed. Evidence OCR completed.'
      },
      {
        user: 'SHO (Vikramaditya Patel)',
        timestamp: new Date('2026-02-20T18:30:00Z'),
        description: 'Official FIR GJ-AHM-2026-008819 registered under BNS Section 318(4), 319 & IT Act 66D.'
      }
    ]
  });

  // 5. Create AI Case Understanding Snapshot
  await CaseUnderstanding.create({
    case_id: complaintNumber,
    case_understanding: {
      executive_summary: 'Retired engineer lured into fake WhatsApp stock investment advisory group "Viking Global INVST c29" by suspect Kiran Kaur. Transferred Rs 1.95 Crores across 29 transactions to mule merchant accounts. Fraudsters demanded additional Rs 70 Lakhs tax upon withdrawal request.',
      incident_brief: 'In February 2024, complainant received promotional link to vikinginvestors.top. Suspect Kiran Kaur (+91 8269935967) induced complainant to invest through fake app. Funds routed to ICICI/HDFC mule accounts.',
      crime_category: 'CYBERCRIME',
      crime_subtype: 'Financial Stock Trading Scam',
      priority: 'high',
      confidence: 0.96
    },
    timeline: [
      { timestamp: 'February 2024', description: 'Complainant received promotional message and joined WhatsApp group "Viking Global INVST c29".', supporting_evidence_ids: ['whatsapp_chat_kiran_kaur.png'] },
      { timestamp: '20/02/2024', description: 'Suspect Kiran Kaur contacted complainant introducing herself as investment advisor.', supporting_evidence_ids: ['whatsapp_chat_kiran_kaur.png'] },
      { timestamp: '19/02/2024 to 10/04/2024', description: 'Complainant transferred Rs 1,95,00,000 across 29 transfers to mule bank accounts.', supporting_evidence_ids: ['bank_statement_icici_2024.pdf'] },
      { timestamp: '01/03/2024', description: 'Suspects demanded Rs 70,00,000 advance tax when withdrawal requested.', supporting_evidence_ids: ['whatsapp_chat_kiran_kaur.png'] }
    ],
    evidence_intelligence: [
      {
        evidence_id: 'bank_statement_icici_2024.pdf',
        filename: 'ICICI_Bank_29_Transfers_Statement.pdf',
        caption: '29 IMPS/NEFT Transaction Statements',
        summary: 'Contains certified transaction log of 29 debits totaling Rs 1.95 Crores to 3 primary beneficiary mule accounts.',
        importance: 'high',
        supports: ['Transfer of Rs. 1,95,00,000 across multiple bank accounts', 'Identification of mule beneficiary accounts']
      },
      {
        evidence_id: 'whatsapp_chat_kiran_kaur.png',
        filename: 'WhatsApp_Chat_Screenshot_KiranKaur.png',
        caption: 'Kiran Kaur Chat Logs & Tax Demand',
        summary: 'Direct WhatsApp chat logs showing fraudulent investment promises and Rs 70 Lakh tax demand.',
        importance: 'high',
        supports: ['Fraudulent online trading inducement', 'Extortion under guise of withdrawal tax']
      }
    ],
    missing_information_and_evidence: [
      {
        title: 'Mule Account Beneficiary KYC Details',
        description: 'Official bank KYC records for ICICI/HDFC accounts receiving Rs. 1.95 Crore transfers.',
        importance: 'high'
      },
      {
        title: 'WhatsApp CDR & IP Logs',
        description: 'Call detail records and IP logs for suspect number +91 8269935967.',
        importance: 'high'
      }
    ],
    contradictions: [],
    original_complaint: newComplaint.detailedDescription,
    processing_duration_ms: 14500,
    created_at: new Date().toISOString()
  });

  // 6. Create Case Checklist Steps
  await CaseChecklist.create({
    case_id: complaintNumber,
    steps: [
      {
        step_id: 'STEP_001',
        title: 'Freeze Mule Bank Accounts',
        description: 'Issue urgent 91 CrPC notice to ICICI Bank & HDFC Bank nodal officers to freeze beneficiary accounts.',
        status: 'in_progress',
        criticality: 'high',
        target: 'department_entity',
        department_entity_id: 'BANK_HDFC_NODAL'
      },
      {
        step_id: 'STEP_002',
        title: 'Obtain WhatsApp CDR & IP Logs',
        description: 'Request subscriber info and IP logs for suspect number +91 8269935967 from Meta Nodal Officer.',
        status: 'pending',
        criticality: 'high',
        target: 'department_entity',
        department_entity_id: 'META_NODAL_INDIA'
      },
      {
        step_id: 'STEP_003',
        title: 'Record Complainant Supplementary Statement',
        description: 'Record formal statement of Anil Kumar Singh detailing original WhatsApp group invitation.',
        status: 'completed',
        criticality: 'medium',
        target: 'complainant'
      }
    ]
  });

    console.log(`\n======================================================`);
    console.log(`SUCCESS! Sample Cyber Crime Complaint Seeded to ${mongoUri}`);
    console.log(`Case ID: ${complaintNumber}`);
    console.log(`Complainant: Anil Kumar Singh (9825012345)`);
    console.log(`======================================================\n`);

    await conn.close();
  } catch (err) {
    console.error(`Failed seeding to ${mongoUri}:`, err.message);
  }
}

async function main() {
  const uris = [
    process.env.MONGODB_URI,
    process.env.MONGODB_ATLAS_URI,
    'mongodb://localhost:27017/crime-os',
    'mongodb://127.0.0.1:27017/crime-os'
  ].filter(Boolean);

  const uniqueUris = [...new Set(uris)];
  for (const uri of uniqueUris) {
    await seedToUri(uri);
  }
  process.exit(0);
}

main();
