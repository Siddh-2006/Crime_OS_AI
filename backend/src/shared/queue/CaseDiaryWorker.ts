import { Job } from 'bullmq';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { createWorker } from '../../config/bullmq';
import { QUEUE_NAMES } from '../constants/queue.constants';
import cloudinary from '../../config/cloudinary';
import logger from '../../config/logger';
import type { CaseDiaryPdfJobData } from './CaseDiaryQueue';
import { Complaint } from '../../modules/complaint/models/Complaint.model';
import { CaseParticipant } from '../../modules/investigation/models/CaseParticipant.model';

function getFontPath(): string | null {
  const possiblePaths = [
    path.resolve(process.cwd(), 'src/assets/fonts/NotoSansGujarati.ttf'),
    path.resolve(process.cwd(), 'dist/assets/fonts/NotoSansGujarati.ttf'),
    path.join(__dirname, '../../assets/fonts/NotoSansGujarati.ttf'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

interface CaseDiaryField {
  numEn: string;
  numGuj: string;
  labelEn: string;
  labelGuj: string;
  value: string;
}

async function build16Fields(diary: any, complaint: any, participants: any[]): Promise<CaseDiaryField[]> {
  const complainants = participants.filter((p) => p.roles?.includes('Complainant'));
  const accused = participants.filter((p) => p.roles?.includes('Accused') || p.roles?.includes('Suspect'));

  const complainantText = complainants.length > 0
    ? complainants.map((c) => `${c.name || ''} ${c.contact?.address || ''} ${c.contact?.phone ? 'મો.નં.' + c.contact.phone : ''}`.trim()).join('; ')
    : (complaint?.citizen ? `${complaint.citizen.firstName || ''} ${complaint.citizen.lastName || ''} રહે.${complaint.citizen.address || ''} મો.નં.${complaint.citizen.phone || ''}`.trim() : '-----');

  const accusedText = accused.length > 0
    ? accused.map((a, i) => `(${i + 1}) ${a.name || ''} ${a.contact?.phone ? 'મો.નં. ' + a.contact.phone : ''} ${a.contact?.address || ''}`.trim()).join(' ')
    : (diary.structured_data?.accused_details || 'તપાસમાં નીકળે તેઓ વિગેરે.');

  const diaryDateStr = diary.diary_date ? new Date(diary.diary_date).toLocaleDateString('en-IN') : '';

  return [
    {
      numEn: '(1)', numGuj: '(૧)',
      labelEn: 'Investigation Officer', labelGuj: 'તપાસ અઘિકારી',
      value: diary.official_officer_id || (complaint?.assignedIO ? `${complaint.assignedIO.officerName}, પોલીસ ઇન્સ્પેક્ટર` : 'પોલીસ ઇન્સ્પેક્ટર'),
    },
    {
      numEn: '(2)', numGuj: '(ર)',
      labelEn: 'Police Station', labelGuj: 'પોલીસ સ્ટેશન',
      value: diary.structured_data?.police_station || (complaint?.policeStation?.name ? `${complaint.policeStation.name} પોલીસ સ્ટેશન` : 'સાયબર ક્રાઇમ પોલીસ સ્ટેશન'),
    },
    {
      numEn: '(3)', numGuj: '(૩)',
      labelEn: 'District', labelGuj: 'જીલ્લો',
      value: diary.structured_data?.district || (complaint?.policeStation?.district || 'સુરત શહેર'),
    },
    {
      numEn: '(4)', numGuj: '(૪)',
      labelEn: 'Crime Register No. and Section', labelGuj: 'ગુના રજીસ્ટર નંબર અને કલમ',
      value: diary.crime_register_number || (complaint?.firNumber ? `ગુ.ર.નં. ${complaint.firNumber}` : '-----'),
    },
    {
      numEn: '(5)', numGuj: '(૫)',
      labelEn: 'Name of Complainant and his residence', labelGuj: 'ખબર આપનારનું નામ અને ઠેકાણું.',
      value: complainantText,
    },
    {
      numEn: '(6)', numGuj: '(૬)',
      labelEn: 'Name of the accused and date and time of arrest', labelGuj: 'આરોપીનું નામ સરનામુ અને અટક તારીખ,ટાઈમ',
      value: accusedText,
    },
    {
      numEn: '(7a)', numGuj: '(ક)',
      labelEn: 'Whether in custody or no bail?', labelGuj: 'પોલીસ કબજામાં કે જામીન ૫ર ?',
      value: diary.custody_status || '-----',
    },
    {
      numEn: '(7b)', numGuj: '(ખ)',
      labelEn: 'Date and time of sending to magisterial custody', labelGuj: 'મેજીસ્ટ્રેટના કબજામાં મોકલ્યા તારીખ, સમય',
      value: diary.magisterial_custody_date || '-----',
    },
    {
      numEn: '(8)', numGuj: '(૮)',
      labelEn: 'Place of offence', labelGuj: 'ગુનાનુ સ્થળ',
      value: complaint?.incidentPlace || 'ઇન્ટરનેટના માધ્યમથી',
    },
    {
      numEn: '(9)', numGuj: '(૯)',
      labelEn: 'Date and time of offence', labelGuj: 'ગુનાની તારીખ અને સમય',
      value: complaint?.incidentDate ? new Date(complaint.incidentDate).toLocaleDateString('en-IN') : '-----',
    },
    {
      numEn: '(10)', numGuj: '(૧૦)',
      labelEn: 'Date and time of registration', labelGuj: 'ગુનો દાખલ કર્યાની તારીખ અને સમય',
      value: complaint?.firRegisteredAt ? new Date(complaint.firRegisteredAt).toLocaleString('en-IN') : '-----',
    },
    {
      numEn: '(11)', numGuj: '(૧૧)',
      labelEn: 'Place Visited', labelGuj: 'તપાસેલ જગ્યાઓ',
      value: Array.isArray(diary.places_visited) && diary.places_visited.length > 0 ? diary.places_visited.join(', ') : (complaint?.policeStation?.city || 'સુરત'),
    },
    {
      numEn: '(12)', numGuj: '(૧૨)',
      labelEn: 'Property stolen', labelGuj: 'ચોરાયેલ મિલ્કત',
      value: diary.property_stolen || '-----',
    },
    {
      numEn: '(13)', numGuj: '(૧૩)',
      labelEn: 'Property recovered', labelGuj: 'હાથ ધરાયેલ મિલ્કત',
      value: diary.property_recovered || '-----',
    },
    {
      numEn: '(14)', numGuj: '(૧૪)',
      labelEn: 'Time officer began and concluded investigation', labelGuj: 'અધિકારીએ તપાસ શરૂ કર્યાનો અને પુરી કર્યાનો સમય',
      value: `કલાક-${diary.investigation_start_time || '10/00'} થી કલાક-${diary.investigation_end_time || '18/00'} સુધી`,
    },
    {
      numEn: '(15)', numGuj: '(૧૫)',
      labelEn: 'Case Diary Number and Date', labelGuj: 'કેસ ડાયરીના નંબર અને તારીખ',
      value: `કેસ ડાયરી નંબર: ${String(diary.diary_number).padStart(2, '0')} તારીખ: ${diaryDateStr}`,
    },
    {
      numEn: '(16)', numGuj: '(૧૬)',
      labelEn: 'Last Case Number and Date', labelGuj: 'છેલ્લી કેસ ડાયરીનો નંબર અને તારીખ',
      value: diary.last_diary_number ? `કેસ ડાયરી નંબર: ${String(diary.last_diary_number).padStart(2, '0')} તારીખ: ${diary.last_diary_date || ''}` : '-----',
    },
  ];
}

async function generateSinglePdfBuffer(diary: any, complaint: any, participants: any[], narrativeText: string, _lang: 'guj_en' | 'en'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const gujFontPath = getFontPath();
    if (gujFontPath) {
      doc.registerFont('GujaratiFont', gujFontPath);
    }

    const setFontBold = (size: number) => {
      if (gujFontPath) doc.font('GujaratiFont').fontSize(size);
      else doc.font('Helvetica-Bold').fontSize(size);
    };

    const setFontRegular = (size: number) => {
      if (gujFontPath) doc.font('GujaratiFont').fontSize(size);
      else doc.font('Helvetica').fontSize(size);
    };

    // Header
    setFontBold(16);
    doc.text('CASE DIARY', { align: 'center' });
    setFontBold(12);
    const dateStr = diary.diary_date ? new Date(diary.diary_date).toLocaleDateString('en-IN') : '';
    doc.text(`No: ${diary.diary_number} Date:${dateStr}`, { align: 'center' });
    doc.moveDown(0.5);

    // Build 16 fields table
    build16Fields(diary, complaint, participants).then((fields) => {
      const startX = 40;
      const leftColWidth = 220;
      const rightColWidth = 295;
      const tableWidth = leftColWidth + rightColWidth;

      let currentY = doc.y;

      fields.forEach((field) => {
        const rowTop = currentY;

        // Draw left label
        setFontRegular(8.5);
        const labelText = `${field.numEn}    ${field.labelEn}\n${field.numGuj}    ${field.labelGuj}`;
        const labelHeight = doc.heightOfString(labelText, { width: leftColWidth - 10, align: 'left' });

        const valueHeight = doc.heightOfString(field.value, { width: rightColWidth - 10, align: 'left' });
        const rowHeight = Math.max(labelHeight, valueHeight, 18) + 8;

        // Check page boundary
        if (rowTop + rowHeight > 780) {
          doc.addPage();
          currentY = 40;
        }

        const actualRowTop = currentY;
        const cellPaddingTop = actualRowTop + 4;

        // Print left column
        setFontRegular(8.5);
        doc.text(labelText, startX + 5, cellPaddingTop, { width: leftColWidth - 10, align: 'left' });

        // Print right column
        setFontRegular(8.5);
        doc.text(field.value, startX + leftColWidth + 5, cellPaddingTop, { width: rightColWidth - 10, align: 'left' });

        // Draw horizontal line
        doc.lineWidth(0.5).moveTo(startX, actualRowTop + rowHeight).lineTo(startX + tableWidth, actualRowTop + rowHeight).stroke();

        // Draw vertical divider
        doc.lineWidth(0.5).moveTo(startX + leftColWidth, actualRowTop).lineTo(startX + leftColWidth, actualRowTop + rowHeight).stroke();

        currentY += rowHeight;
      });

      // Outer table border
      doc.lineWidth(0.8).rect(startX, fields.length > 0 ? 80 : startX, tableWidth, currentY - 80).stroke();

      doc.y = currentY + 15;

      // Section Title: Record of Investigation
      if (doc.y > 720) doc.addPage();

      setFontBold(12);
      doc.text('RECORD OF INVESTIGATION', { align: 'left' });
      setFontBold(11);
      doc.text('તપાસનું રેકર્ડ', { align: 'left' });
      doc.moveDown(0.4);

      // Render Record Narrative
      setFontRegular(9.5);
      const paragraphs = narrativeText.split(/\n{2,}/).filter(Boolean);
      if (paragraphs.length === 0) {
        doc.text(narrativeText, { align: 'justify', lineGap: 2 });
      } else {
        paragraphs.forEach((p) => {
          if (doc.y > 750) doc.addPage();
          doc.text(p.trim(), { align: 'justify', lineGap: 2 });
          doc.moveDown(0.3);
        });
      }

      doc.moveDown(1.5);
      if (doc.y > 750) doc.addPage();

      // Signature block
      setFontBold(10);
      const officerName = diary.official_officer_id || (complaint?.assignedIO?.officerName || 'એન.આર.પટેલ, પોલીસ ઇન્સ્પેક્ટર');
      const stationName = diary.structured_data?.police_station || (complaint?.policeStation?.name ? `${complaint.policeStation.name} પોલીસ સ્ટેશન` : 'સાયબર ક્રાઇમ પોલીસ સ્ટેશન, સુરત શહેર');

      doc.text(officerName, { align: 'right' });
      doc.text(stationName, { align: 'right' });

      doc.end();
    }).catch(reject);
  });
}

export function startCaseDiaryWorker(): void {
  createWorker<CaseDiaryPdfJobData>(QUEUE_NAMES.CASE_DIARY, async (job: Job<CaseDiaryPdfJobData>) => {
    const { diaryId, caseId } = job.data;
    logger.info('[Case_Diary] PDF generation worker started', { diaryId, caseId, jobId: job.id });

    const { CaseDiary } = await import('../../modules/investigation/models/CaseDiary.model');
    const diary = await CaseDiary.findOne({ diary_id: diaryId, case_id: caseId }).exec();

    if (!diary) {
      throw new Error(`Case diary ${diaryId} not found`);
    }

    const complaint = await Complaint.findById(caseId)
      .populate('citizen', 'firstName lastName email phone address')
      .populate('policeStation', 'name code city district state address')
      .populate('assignedIO', 'officerName badgeNumber')
      .lean()
      .exec();

    const participants = await CaseParticipant.find({ case_id: diary.case_id }).lean().exec();

    const gujEnText = diary.record_of_investigation_guj_en || diary.record_of_investigation || '';
    const enText = diary.record_of_investigation_en || diary.record_of_investigation || '';

    if (!gujEnText && !enText) {
      throw new Error('Diary narrative content missing for PDF generation');
    }

    // Generate Guj-English PDF
    const pdfBufferGujEn = await generateSinglePdfBuffer(diary, complaint, participants, gujEnText, 'guj_en');
    logger.info('[Case_Diary] Guj-En PDF rendered', { diaryId, caseId, bytes: pdfBufferGujEn.length });

    // Generate English PDF
    const pdfBufferEn = await generateSinglePdfBuffer(diary, complaint, participants, enText, 'en');
    logger.info('[Case_Diary] English PDF rendered', { diaryId, caseId, bytes: pdfBufferEn.length });

    try {
      // Upload Guj-En PDF
      const uploadResultGujEn = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: 'case-diaries',
            resource_type: 'raw',
            public_id: `${caseId}-${diaryId}-guj-en`,
            format: 'pdf',
            overwrite: true,
          },
          (error, result) => {
            if (error) return reject(error);
            if (!result) return reject(new Error('Cloudinary returned no result'));
            return resolve(result);
          },
        ).end(pdfBufferGujEn);
      });

      // Upload English PDF
      const uploadResultEn = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: 'case-diaries',
            resource_type: 'raw',
            public_id: `${caseId}-${diaryId}-en`,
            format: 'pdf',
            overwrite: true,
          },
          (error, result) => {
            if (error) return reject(error);
            if (!result) return reject(new Error('Cloudinary returned no result'));
            return resolve(result);
          },
        ).end(pdfBufferEn);
      });

      const secureGujEn = String(uploadResultGujEn.secure_url || uploadResultGujEn.secureUrl || uploadResultGujEn.url || '');
      const secureEn = String(uploadResultEn.secure_url || uploadResultEn.secureUrl || uploadResultEn.url || '');

      const serveableGujEn = secureGujEn.includes('/upload/') ? secureGujEn.replace('/upload/', '/upload/fl_attachment/') : secureGujEn;
      const serveableEn = secureEn.includes('/upload/') ? secureEn.replace('/upload/', '/upload/fl_attachment/') : secureEn;

      diary.pdf_url_guj_en = serveableGujEn;
      diary.pdf_url_en = serveableEn;
      diary.pdf_url = serveableGujEn; // Fallback / backwards compatibility
      diary.cloudinary_id_guj_en = String(uploadResultGujEn.public_id || '');
      diary.cloudinary_id_en = String(uploadResultEn.public_id || '');
      diary.cloudinary_id = String(uploadResultGujEn.public_id || '');

      await diary.save();

      logger.info('[Case_Diary] Both PDFs uploaded to Cloudinary', {
        diaryId,
        caseId,
        pdfUrlGujEn: serveableGujEn,
        pdfUrlEn: serveableEn,
      });
    } catch (err: any) {
      logger.error('[Case_Diary] Cloudinary upload failed', { diaryId, caseId, error: err?.message || String(err) });
      throw err;
    }
  });
}

