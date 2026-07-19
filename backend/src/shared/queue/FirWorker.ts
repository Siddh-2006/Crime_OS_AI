import { Job } from 'bullmq';
import PDFDocument from 'pdfkit';
import { createWorker } from '../../config/bullmq';
import { QUEUE_NAMES } from '../constants/queue.constants';
import { EmailQueue } from './EmailQueue';
import cloudinary from '../../config/cloudinary';
import logger from '../../config/logger';
import type { FirPdfJobData } from './FirQueue';

/**
 * Lazily import Complaint model to avoid circular dependency issues.
 * The worker is started after all models are registered.
 */
async function getComplaintModel() {
  const { Complaint } = await import('../../modules/complaint/models/Complaint.model');
  return Complaint;
}

/**
 * Generates a clean, properly-laid-out Indian Police FIR PDF using pdfkit.
 * Returns a Buffer containing the PDF bytes.
 */
async function generateFirPdf(data: {
  firNumber: string;
  complaintNumber: string;
  registrationDate: Date;
  policeStation: string;
  district: string;
  state: string;
  complainantName: string;
  complainantPhone: string;
  complainantAddress: string;
  incidentDate: Date;
  incidentTime: string;
  incidentPlace: string;
  category: string;
  description: string;
  officerName: string;
  officerBadge: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W   = doc.page.width;   // 595.28
    const MARGIN   = 50;
    const CONTENT_W = PAGE_W - MARGIN * 2; // 495.28

    const DARK_BLUE   = '#1a237e';
    const MID_BLUE    = '#283593';
    const LIGHT_GRAY  = '#f0f0f5';
    const DIVIDER     = '#cccccc';
    const TEXT_DARK   = '#111111';
    const TEXT_MID    = '#444444';
    const TEXT_LIGHT  = '#888888';

    // ─── Helper: draw a section header bar ──────────────────────────────────────
    const sectionBar = (title: string, y: number): number => {
      doc.rect(MARGIN, y, CONTENT_W, 22).fill(DARK_BLUE);
      doc.fill('white').font('Helvetica-Bold').fontSize(9)
         .text(title, MARGIN + 8, y + 6, { width: CONTENT_W - 16 });
      doc.fill(TEXT_DARK);
      return y + 22;
    };

    // ─── Helper: label-value row ─────────────────────────────────────────────────
    const labelRow = (label: string, value: string, y: number, indent = MARGIN + 10): number => {
      const lineH = 16;
      doc.font('Helvetica-Bold').fontSize(9).fill(TEXT_MID)
         .text(`${label}:`, indent, y, { continued: true });
      doc.font('Helvetica').fill(TEXT_DARK)
         .text(`  ${value}`, { width: CONTENT_W - (indent - MARGIN) - 10, lineGap: 2 });
      return Math.max(doc.y, y + lineH) + 3;
    };

    let y = MARGIN;

    // ════════════════════════════════════════════════════════════════════════════
    // HEADER
    // ════════════════════════════════════════════════════════════════════════════
    doc.rect(MARGIN, y, CONTENT_W, 78).fill(DARK_BLUE);

    // Emblem placeholder circle
    doc.circle(MARGIN + 38, y + 39, 28).stroke('rgba(255,255,255,0.4)');
    doc.fontSize(8).fill('rgba(255,255,255,0.6)').text('GUJARAT\nPOLICE', MARGIN + 10, y + 28, { width: 56, align: 'center' });

    // Title text (offset right of emblem)
    doc.fill('white').font('Helvetica-Bold').fontSize(18)
       .text('GUJARAT POLICE', MARGIN + 80, y + 12, { width: CONTENT_W - 80 });
    doc.font('Helvetica-Bold').fontSize(11).fill('rgba(255,255,255,0.9)')
       .text('First Information Report (FIR)', MARGIN + 80, y + 35, { width: CONTENT_W - 80 });
    doc.font('Helvetica').fontSize(8).fill('rgba(255,255,255,0.6)')
       .text('Crime OS — Digital Portal  |  Serving with Integrity', MARGIN + 80, y + 53, { width: CONTENT_W - 80 });

    y += 78 + 10;

    // ════════════════════════════════════════════════════════════════════════════
    // META TABLE  (4 cells in a 2x2 grid — clean, no overflow)
    // ════════════════════════════════════════════════════════════════════════════
    const ROW_H    = 36;
    const COL1_W   = CONTENT_W / 2;  // ~247
    const COL2_W   = CONTENT_W - COL1_W;

    doc.rect(MARGIN, y, CONTENT_W, ROW_H * 2).fill(LIGHT_GRAY).stroke(DIVIDER);
    // vertical divider
    doc.moveTo(MARGIN + COL1_W, y).lineTo(MARGIN + COL1_W, y + ROW_H * 2).stroke(DIVIDER);
    // horizontal divider
    doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + CONTENT_W, y + ROW_H).stroke(DIVIDER);

    const metaCell = (label: string, value: string, cx: number, cy: number, w: number) => {
      doc.font('Helvetica-Bold').fontSize(7.5).fill(MID_BLUE)
         .text(label.toUpperCase(), cx + 8, cy + 6, { width: w - 16 });
      doc.font('Helvetica-Bold').fontSize(9.5).fill(DARK_BLUE)
         .text(value, cx + 8, cy + 17, { width: w - 16, lineBreak: false, ellipsis: true });
    };

    metaCell('FIR Number',       data.firNumber,                                    MARGIN,          y,          COL1_W);
    metaCell('Registration Date', data.registrationDate.toLocaleDateString('en-IN'), MARGIN + COL1_W, y,          COL2_W);
    metaCell('Complaint Reference', data.complaintNumber,                            MARGIN,          y + ROW_H,  COL1_W);
    metaCell('Registration Time', data.registrationDate.toLocaleTimeString('en-IN'), MARGIN + COL1_W, y + ROW_H,  COL2_W);

    y += ROW_H * 2 + 16;

    // ════════════════════════════════════════════════════════════════════════════
    // PART I — STATION DETAILS
    // ════════════════════════════════════════════════════════════════════════════
    y = sectionBar('PART I — STATION DETAILS', y);
    y += 8;
    y = labelRow('Police Station', data.policeStation, y);
    y = labelRow('District',       data.district,      y);
    y = labelRow('State',          data.state,         y);
    y += 12;

    // ════════════════════════════════════════════════════════════════════════════
    // PART II — COMPLAINANT DETAILS
    // ════════════════════════════════════════════════════════════════════════════
    y = sectionBar('PART II — COMPLAINANT DETAILS', y);
    y += 8;
    y = labelRow('Full Name',         data.complainantName,    y);
    y = labelRow('Contact Phone',     data.complainantPhone,   y);
    y = labelRow('Address',           data.complainantAddress, y);
    y += 12;

    // ════════════════════════════════════════════════════════════════════════════
    // PART III — OCCURRENCE OF OFFENCE
    // ════════════════════════════════════════════════════════════════════════════
    y = sectionBar('PART III — OCCURRENCE OF OFFENCE', y);
    y += 8;
    y = labelRow('Date of Incident',   data.incidentDate.toLocaleDateString('en-IN'), y);
    y = labelRow('Time of Incident',   data.incidentTime || 'Not specified', y);
    y = labelRow('Place of Occurrence', data.incidentPlace, y);
    y = labelRow('Category of Crime',  data.category, y);
    y += 12;

    // ════════════════════════════════════════════════════════════════════════════
    // PART IV — BRIEF FACTS
    // ════════════════════════════════════════════════════════════════════════════
    y = sectionBar('PART IV — BRIEF FACTS / WRITTEN COMPLAINT', y);
    y += 10;

    // Light box for the description
    const descStartY = y;
    doc.font('Helvetica').fontSize(9.5).fill(TEXT_DARK);
    doc.text(data.description, MARGIN + 10, y, {
      width: CONTENT_W - 20,
      align: 'justify',
      lineGap: 3,
    });
    y = doc.y + 4;
    doc.rect(MARGIN, descStartY - 4, CONTENT_W, y - descStartY + 8).stroke(DIVIDER);
    y += 20;

    // ════════════════════════════════════════════════════════════════════════════
    // SIGNATURE ROW
    // ════════════════════════════════════════════════════════════════════════════
    // Make sure we have at least 120px for the signature section
    const FOOTER_RESERVE = 80;
    if (y > doc.page.height - FOOTER_RESERVE - 120) {
      doc.addPage();
      y = MARGIN;
    }

    // Divider line
    doc.rect(MARGIN, y, CONTENT_W, 1).fill(DIVIDER);
    y += 16;

    const SIG_BOX_Y = y;
    const COL_SIG   = CONTENT_W / 3;

    // Officer column
    doc.font('Helvetica-Bold').fontSize(9).fill(DARK_BLUE)
       .text('Registering Officer:', MARGIN + 10, SIG_BOX_Y);
    doc.font('Helvetica').fontSize(9.5).fill(TEXT_DARK)
       .text(data.officerName, MARGIN + 10, SIG_BOX_Y + 16)
       .font('Helvetica').fontSize(8).fill(TEXT_LIGHT)
       .text(`Badge No: ${data.officerBadge}`, MARGIN + 10, SIG_BOX_Y + 30);

    // Stamp / seal column
    const sealX = MARGIN + COL_SIG + 20;
    doc.font('Helvetica-Bold').fontSize(9).fill(DARK_BLUE)
       .text('SHO / Station Seal:', sealX, SIG_BOX_Y);
    doc.rect(sealX, SIG_BOX_Y + 14, 110, 50).stroke('#aaa');
    doc.font('Helvetica').fontSize(8).fill('#bbb')
       .text('(Official Stamp)', sealX + 10, SIG_BOX_Y + 32);

    // QR placeholder
    const qrX = MARGIN + COL_SIG * 2 + 30;
    doc.rect(qrX, SIG_BOX_Y, 70, 70).stroke('#ddd');
    doc.font('Helvetica').fontSize(7).fill(TEXT_LIGHT)
       .text('[ Digital\nVerification\nQR Code ]', qrX + 5, SIG_BOX_Y + 18, { width: 60, align: 'center' });

    // ─── Footer ─────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 48;
    doc.rect(MARGIN, footerY - 4, CONTENT_W, 1).fill('#ddd');
    doc.font('Helvetica').fontSize(7.5).fill(TEXT_LIGHT)
       .text(
         `FIR: ${data.firNumber}  |  Generated by Gujarat Police Crime OS Digital System  |  Verify at crimeOS.gujarat.gov.in  |  ${new Date().toISOString()}`,
         MARGIN,
         footerY + 4,
         { width: CONTENT_W, align: 'center' },
       );

    doc.end();
  });
}

/**
 * FIR BullMQ Worker.
 * Generates the FIR PDF, uploads to Cloudinary as raw (preserves true PDF bytes),
 * saves URL, and sends email. Never import from routes/controllers.
 */
export function startFirWorker(): void {
  createWorker<FirPdfJobData>(QUEUE_NAMES.FIR, async (job: Job<FirPdfJobData>) => {
    const { complaintId } = job.data.payload;
    logger.info('Processing FIR PDF generation', { complaintId });

    const Complaint = await getComplaintModel();

    const complaint = await Complaint.findById(complaintId)
      .populate('policeStation', 'name code city district state')
      .populate('assignedIO', 'officerName badgeNumber')
      .populate('citizen', 'firstName lastName email phone address city district state')
      .exec();

    if (!complaint) {
      throw new Error(`Complaint ${complaintId} not found for FIR generation`);
    }

    const latestDesc = complaint.descriptionHistory[complaint.descriptionHistory.length - 1];
    const station    = complaint.policeStation as any;
    const citizen    = complaint.citizen as any;
    const io         = complaint.assignedIO as any;

    const pdfBuffer = await generateFirPdf({
      firNumber:          complaint.firNumber!,
      complaintNumber:    complaint.complaintNumber,
      registrationDate:   complaint.firRegisteredAt!,
      policeStation:      station?.name    ?? 'Unknown Station',
      district:           station?.district ?? 'Unknown District',
      state:              station?.state    ?? 'Gujarat',
      complainantName:    `${citizen?.firstName ?? ''} ${citizen?.lastName ?? ''}`.trim(),
      complainantPhone:   citizen?.phone    ?? '',
      complainantAddress: `${citizen?.address ?? ''}, ${citizen?.city ?? ''}`,
      incidentDate:       complaint.incidentDate,
      incidentTime:       complaint.incidentTime ?? '',
      incidentPlace:      complaint.incidentPlace,
      category:           complaint.category || 'UNCATEGORIZED',
      description:        latestDesc?.content ?? complaint.shortDescription,
      officerName:        io?.officerName    ?? 'On-Duty Officer',
      officerBadge:       io?.badgeNumber    ?? 'N/A',
    });

    // Upload as resource_type:'raw' to preserve real PDF bytes.
    // Append fl_attachment when serving so browser downloads/opens it as PDF.
    const uploadResult = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        const folder = `crime-os/fir/${complaintId}`;
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: `fir_${complaint.firNumber}`,
            resource_type: 'raw',
            format: 'pdf',
            overwrite: true,
          },
          (error, result) => {
            if (error || !result) return reject(error ?? new Error('Upload failed'));
            resolve(result as { secure_url: string; public_id: string });
          },
        );
        uploadStream.end(pdfBuffer);
      },
    );

    // Transform the stored URL to include fl_attachment so it opens correctly in browser
    // e.g. /raw/upload/fl_attachment/v123/crime-os/fir/...
    const serveableUrl = uploadResult.secure_url.replace(
      '/raw/upload/',
      '/raw/upload/fl_attachment/',
    );

    await Complaint.findByIdAndUpdate(complaintId, {
      firPdfUrl:      serveableUrl,
      firPdfPublicId: uploadResult.public_id,
    });

    logger.info('FIR PDF uploaded to Cloudinary', {
      complaintId,
      firNumber: complaint.firNumber,
      publicId: uploadResult.public_id,
    });

    await EmailQueue.enqueueFirRegisteredEmail({
      to:              citizen?.email ?? '',
      name:            `${citizen?.firstName ?? ''} ${citizen?.lastName ?? ''}`.trim(),
      complaintNumber: complaint.complaintNumber,
      firNumber:       complaint.firNumber!,
      firPdfUrl:       serveableUrl,
    });
  });

  logger.info('FIR PDF worker started');
}
