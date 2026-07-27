import crypto from 'crypto';
import os from 'os';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import axios from 'axios';
import env from '../config/env';
import { NodemailerProvider } from '../shared/services/email/NodemailerProvider';
import { EmailService } from '../shared/services/email/EmailService';
import logger from '../config/logger';

function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('10.') || net.address.startsWith('192.168.') || net.address.startsWith('172.')) {
          return net.address;
        }
      }
    }
  }
  return 'localhost';
}

export async function sendEvidenceNoticeForCase(
  caseId: string,
  recipientEmail?: string,
  complainantName?: string,
  complaintNumber?: string
): Promise<void> {
  const compNum = complaintNumber || caseId;
  logger.info(`Processing Evidence Upload Notice Email for Case: ${caseId}`);

  // Connect to MongoDB Atlas if not connected
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection failed.');
  }

  // 1. Fetch complaint / complainant details if not provided
  let targetEmail = recipientEmail;
  let targetName = complainantName;

  const queryFilters: any[] = [{ case_id: caseId }, { complaintNumber: caseId }];
  if (mongoose.Types.ObjectId.isValid(caseId)) {
    queryFilters.push({ _id: new mongoose.Types.ObjectId(caseId) });
  }

  const complaintDoc = await db.collection('complaints').findOne({ $or: queryFilters });

  if (complaintDoc) {
    targetName = targetName || complaintDoc.complainantName || complaintDoc.name || 'Valued Citizen';
    targetEmail = targetEmail || complaintDoc.contactEmail || complaintDoc.email || complaintDoc.complainantEmail;
  }

  if (!targetEmail) {
    targetEmail = 'crimeosxbrightweb@gmail.com'; // Default fallback email for demonstration
  }
  if (!targetName) {
    targetName = 'Valued Citizen';
  }

  // 2. Fetch or Generate Upload Token & QR Code
  let uploadUrl = '';
  let qrCodeBase64 = '';

  // Construct public frontend upload URL (uses Wi-Fi IP e.g. 10.42.76.38 so phones on same Wi-Fi can open it)
  let publicBase = process.env.PUBLIC_EVIDENCE_UPLOAD_URL || process.env.PUBLIC_BASE_URL;
  if (!publicBase) {
    const localIp = getLocalIpAddress();
    publicBase = `http://${localIp}:3000`;
  }
  publicBase = publicBase.replace(/\/$/, '');

  try {
    // Attempt via Python HTTP service first
    const tokenRes = await axios.post(`${env.COMPLAINT_INTELLIGENCE_URL}/evidence/upload-token/generate`, {
      case_id: caseId,
      complaint_number: compNum,
    }, { timeout: 3000 });
    const tokenStr = tokenRes.data.token;
    uploadUrl = `${publicBase}/citizen-response/${tokenStr}`;
    qrCodeBase64 = await QRCode.toDataURL(uploadUrl);
  } catch (err) {
    // Direct MongoDB fallback for token generation + QRCode npm package
    logger.info('Python service unreachable, using MongoDB fallback for token & QR generation');
    let tokenDoc = await db.collection('upload_tokens').findOne({ case_id: caseId });
    let tokenStr = '';
    if (tokenDoc && tokenDoc._id) {
      tokenStr = String(tokenDoc._id);
    } else {
      tokenStr = crypto.randomBytes(24).toString('hex');
      uploadUrl = `${publicBase}/citizen-response/${tokenStr}`;
      await db.collection('upload_tokens').insertOne({
        _id: tokenStr as any,
        token: tokenStr,
        case_id: caseId,
        complaint_number: compNum,
        upload_url: uploadUrl,
        created_at: new Date().toISOString(),
        is_revoked: false,
        upload_count: 0,
      });
    }
    uploadUrl = `${publicBase}/citizen-response/${tokenStr}`;
    qrCodeBase64 = await QRCode.toDataURL(uploadUrl);
  }

  // 3. Fetch Case Intelligence for LLM-suggested missing evidence
  let missingEvidence: string[] = [];
  const caseFilters: any[] = [{ case_id: caseId }];
  if (mongoose.Types.ObjectId.isValid(caseId)) {
    caseFilters.push({ _id: new mongoose.Types.ObjectId(caseId) });
  }
  const caseDoc = await db.collection('cases').findOne({ $or: caseFilters });

  if (caseDoc && caseDoc.investigation_intelligence && Array.isArray(caseDoc.investigation_intelligence.missing_evidence)) {
    missingEvidence = caseDoc.investigation_intelligence.missing_evidence;
  }

  logger.info(`Sending email to ${targetEmail} for case ${caseId} with ${missingEvidence.length} suggested items.`);

  // 4. Send Email via Nodemailer (SMTP)
  const emailService = new EmailService(new NodemailerProvider());
  await emailService.sendEvidenceUploadNoticeEmail({
    to: targetEmail,
    complainantName: targetName,
    uploadUrl: uploadUrl,
    qrCodeBase64: qrCodeBase64,
    suggestedEvidence: missingEvidence,
  });

  console.log(`\n==================================================`);
  console.log(`[SUCCESS] Evidence Request Email Sent Successfully!`);
  console.log(`Recipient Email : ${targetEmail}`);
  console.log(`Complainant Name: ${targetName}`);
  console.log(`Case Reference  : ${caseId}`);
  console.log(`Upload URL      : ${uploadUrl}`);
  console.log(`Suggested Items : ${missingEvidence.length} items`);
  console.log(`==================================================\n`);
}

// CLI Execution entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  const caseId = args[0] || 'TEST-CYBER-REAL-001';
  const email = args[1] || 'crimeosxbrightweb@gmail.com';
  const name = args[2] || 'Rahul Chauhan';

  sendEvidenceNoticeForCase(caseId, email, name)
    .then(() => {
      mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[ERROR] Failed to send email:', err.message || err);
      mongoose.disconnect();
      process.exit(1);
    });
}
