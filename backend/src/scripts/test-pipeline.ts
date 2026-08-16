import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import FormData from 'form-data';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Complaint } from '../modules/complaint/models/Complaint.model';
import { DepartmentRequest } from '../modules/investigation/models/DepartmentRequest.model';
import { Evidence } from '../modules/investigation/models/Evidence.model';
import { InvestigationOrchestrator } from '../modules/investigation/services/investigationOrchestrator';
import env from '../config/env';

async function ingestResponse(opts: {
  caseId: string;
  requestId: string;
  departmentEntityId: string;
  responseContent: string;
  attachments: Array<{ filename: string; mimeType: string; buffer?: Buffer; evidenceId?: string }>;
  sender: 'department' | 'citizen';
}): Promise<void> {
  const { caseId, requestId, responseContent, attachments, sender } = opts;

  // 1. Update DepartmentRequest
  const request = await DepartmentRequest.findOne({ request_id: requestId });
  if (request) {
    request.status = 'response_received';
    request.response_ref = responseContent;
    request.response_at = new Date();
    await request.save();
  }

  const SYSTEM_UPLOADER_ID = '000000000000000000000000';
  const evidenceIds: string[] = [];

  for (const att of attachments) {
    const evidenceId = att.evidenceId || uuidv4();
    evidenceIds.push(evidenceId);
    
    await Evidence.create({
      case_id: caseId,
      evidence_id: evidenceId,
      type: 'image',
      storage_ref: 'PENDING_UPLOAD',
      originalFilename: att.filename,
      mimeType: att.mimeType,
      processingStatus: 'PENDING',
      ai_description: `Attachment "${att.filename}" (AI Processing...)`,
      ai_tags: ['test_attachment'],
      uploader_id: SYSTEM_UPLOADER_ID,
      status: 'verified',
      source: sender === 'citizen' ? 'complainant' : 'department',
      linked_request_id: requestId,
    });
    console.log(`[Script] Created PENDING evidence record: ${evidenceId}`);
  }

  // 3. Trigger AI re-analysis
  console.log(`[Script] Triggering AI re-analysis for case ${caseId}...`);
  InvestigationOrchestrator.runAnalysis(caseId).catch(console.error);
}

async function run() {
  await connectDatabase();
  console.log('[Script] Connected to DB.');

  // Find the case
  const cases = await Complaint.find().sort({ createdAt: -1 }).lean();
  const targetCase = cases[0];
  
  if (!targetCase) {
    console.log('Case not found');
    return;
  }
  const caseId = targetCase._id.toString();
  console.log(`[Script] Target Case Found: ${caseId}`);

  // Create a mock DepartmentRequest
  const reqId = uuidv4();
  await DepartmentRequest.create({
    case_id: caseId,
    request_id: reqId,
    department_entity_id: 'cyber_cell',
    request_type: 'external_department',
    recipient_type: 'cyber_cell',
    status: 'sent',
    content: 'Please verify this UPI fraud screenshot.',
    sent_at: new Date()
  });
  console.log(`[Script] Mock DepartmentRequest created: ${reqId}`);

  // Read image
  const imgPath = path.join(__dirname, '../../../../WhatsApp Image 2026-07-28 at 22.14.25.jpeg');
  if (!fs.existsSync(imgPath)) {
     console.error('Image not found:', imgPath);
     return;
  }
  const buffer = fs.readFileSync(imgPath);
  console.log(`[Script] Image read successfully. Size: ${buffer.length} bytes`);

  const attachments: Array<{ filename: string; mimeType: string; buffer: Buffer; evidenceId?: string }> = [{
    filename: 'fraud_evidence.jpeg',
    mimeType: 'image/jpeg',
    buffer
  }];

  // Hit python endpoint
  console.log('[Script] Hitting Python AI pipeline...');
  const tokenRes = await axios.post(`${env.COMPLAINT_INTELLIGENCE_URL}/evidence/upload-token/generate`, null, {
    params: { case_id: caseId }
  });
  const token = tokenRes.data.token;
  console.log(`[Script] Got upload token: ${token}`);

  const formData = new FormData();
  formData.append('uploader_type', 'police');
  formData.append('files', buffer, { filename: 'fraud_evidence.jpeg', contentType: 'image/jpeg' });
  
  const uploadRes = await axios.post(`${env.COMPLAINT_INTELLIGENCE_URL}/evidence/upload/${token}`, formData, {
    headers: formData.getHeaders(),
    timeout: 30000,
  });

  const aiEvidenceIds = uploadRes.data.items.map((i: any) => i.evidence_id);
  console.log(`[Script] Python accepted upload and returned Evidence IDs:`, aiEvidenceIds);
  
  attachments[0].evidenceId = aiEvidenceIds[0];

  console.log('[Script] Calling ingestResponse to complete linking in Node.js...');
  await ingestResponse({
    caseId,
    requestId: reqId,
    departmentEntityId: 'cyber_cell',
    responseContent: 'Here is the verified screenshot as requested.',
    attachments,
    sender: 'department'
  });

  console.log('[Script] Pipeline triggered! Background AI worker is processing the image now.');
  console.log('[Script] Exiting script. You should see Python worker logs and then Node.js IO Dashboard updates.');
  
  setTimeout(async () => {
    await disconnectDatabase();
    process.exit(0);
  }, 3000);
}

run().catch(console.error);
