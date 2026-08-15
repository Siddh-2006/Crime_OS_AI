/**
 * warrantPdfService.ts
 *
 * Generates a PDF buffer for an ArrestWarrant document.
 *
 * Design principles:
 *  - warrant_draft_content is the SINGLE source of truth — embedded verbatim.
 *  - Uses the same PDFKit + NotoSansGujarati font pipeline as FirWorker /
 *    CaseDiaryWorker. No new dependencies introduced.
 *  - Returns a raw Buffer so the caller (WarrantService) can attach it to a
 *    Gmail message without writing to disk.
 *
 * Font resolution order (mirrors FirWorker):
 *   src/assets/fonts/NotoSansGujarati.ttf
 *   dist/assets/fonts/NotoSansGujarati.ttf
 *   __dirname/../../assets/fonts/NotoSansGujarati.ttf
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import type { IArrestWarrant } from '../models/ArrestWarrant.model';
import { applyWatermarkAllPages } from '../../../shared/utils/pdfWatermark';

// ─── Font helpers (mirrors FirWorker exactly) ─────────────────────────────────

interface FontPaths {
  regular: string | null;
  bold: string | null;
}

function getGujaratiFont(): FontPaths {
  const bases = [
    path.resolve(process.cwd(), 'src/assets/fonts'),
    path.resolve(process.cwd(), 'dist/assets/fonts'),
    path.join(__dirname, '../../assets/fonts'),
  ];
  const names = ['NotoSansGujarati', 'Nirmala'];
  for (const base of bases) {
    for (const name of names) {
      const reg  = path.join(base, `${name}.ttf`);
      const bold = path.join(base, `${name}Bold.ttf`);
      if (fs.existsSync(reg)) {
        return { regular: reg, bold: fs.existsSync(bold) ? bold : reg };
      }
    }
  }
  return { regular: null, bold: null };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a complete, self-contained PDF buffer for the given ArrestWarrant.
 * The warrant_draft_content field is embedded verbatim as the body of the document.
 *
 * @param warrant - The ArrestWarrant Mongoose document (or plain lean object).
 * @returns Buffer containing the PDF bytes, ready for email attachment.
 */
export async function generateWarrantPdfBuffer(
  warrant: IArrestWarrant | Record<string, any>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true });
    applyWatermarkAllPages(doc, { text: 'WARRANT — OFFICIAL COPY' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Font setup ─────────────────────────────────────────────────────────
    const gjFont = getGujaratiFont();
    if (gjFont.regular) {
      doc.registerFont('Guj',     gjFont.regular);
      doc.registerFont('GujBold', gjFont.bold || gjFont.regular);
    }

    // Helper: select font + size
    const useFont = (bold: boolean, size: number) => {
      if (gjFont.regular) {
        doc.font(bold ? 'GujBold' : 'Guj').fontSize(size);
      } else {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
      }
    };

    const PAGE_W = doc.page.width;   // 595.28 pt
    const LEFT   = 50;
    const RIGHT  = PAGE_W - 50;
    const WIDTH  = RIGHT - LEFT;     // 495.28 pt

    const checkPage = (needed = 60) => {
      if (doc.y > doc.page.height - needed) doc.addPage();
    };

    // ── Page header ────────────────────────────────────────────────────────
    useFont(true, 14);
    doc.text('WARRANT OF ARREST', LEFT, doc.y, { align: 'center', width: WIDTH });
    doc.moveDown(0.3);

    useFont(false, 10);
    doc.text(
      'Bharatiya Nagarik Suraksha Sanhita, 2023 — Section 70',
      LEFT,
      doc.y,
      { align: 'center', width: WIDTH },
    );
    doc.moveDown(0.2);

    // Thin rule under header
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.6);

    // ── Meta block: FIR ref, station, district ─────────────────────────────
    const metaRows: [string, string][] = [
      ['FIR No.',        String(warrant.fir_number    || '—')],
      ['Police Station', String(warrant.police_station || '—')],
      ['District',       String(warrant.district       || '—')],
      ['Accused',        String(warrant.accused_name   || '—')],
      ['Warrant ID',     String(warrant.warrant_id     || '—')],
      ['Status',         String(warrant.status         || '—')],
    ];

    const labelW = 110;
    for (const [label, value] of metaRows) {
      checkPage(20);
      useFont(true,  9.5);
      doc.text(`${label}:`, LEFT, doc.y, { continued: true, width: labelW });
      useFont(false, 9.5);
      doc.text(`  ${value}`, { width: WIDTH - labelW });
      doc.moveDown(0.2);
    }

    doc.moveDown(0.4);
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(0.3).stroke();
    doc.moveDown(0.6);

    // ── Applied sections ───────────────────────────────────────────────────
    const sections: Array<{ code: string; title: string; reason?: string }> =
      Array.isArray(warrant.applied_sections) ? warrant.applied_sections : [];

    if (sections.length > 0) {
      checkPage(30);
      useFont(true, 9.5);
      doc.text('CHARGES / APPLIED SECTIONS:', LEFT, doc.y, { width: WIDTH });
      doc.moveDown(0.3);

      for (const [i, sec] of sections.entries()) {
        checkPage(20);
        useFont(false, 9.5);
        const reasonNote = sec.reason ? `  (${sec.reason})` : '';
        doc.text(
          `  ${i + 1}.  Section ${sec.code}: ${sec.title}${reasonNote}`,
          LEFT,
          doc.y,
          { width: WIDTH },
        );
        doc.moveDown(0.2);
      }

      doc.moveDown(0.4);
      doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(0.3).stroke();
      doc.moveDown(0.6);
    }

    // ── Warrant body — verbatim from warrant_draft_content ─────────────────
    // This is the canonical text: it may be the BNSS Form No. 2 template or
    // an IO-edited version. Embedded exactly as-is, no reformatting.
    const draftContent = String(warrant.warrant_draft_content || '');

    checkPage(40);
    useFont(true, 9.5);
    doc.text('WARRANT TEXT:', LEFT, doc.y, { width: WIDTH });
    doc.moveDown(0.3);

    useFont(false, 9.5);
    doc.text(draftContent, LEFT, doc.y, {
      width: WIDTH,
      lineGap: 2,
      paragraphGap: 4,
    });
    doc.moveDown(0.6);

    // ── Justification (also present in draftContent but shown separately
    //    for emphasis, so the magistrate sees it clearly) ────────────────────
    const justification = String(warrant.justification || '');
    if (justification) {
      checkPage(40);
      doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(0.3).stroke();
      doc.moveDown(0.4);

      useFont(true, 9.5);
      doc.text('JUSTIFICATION FOR ARREST:', LEFT, doc.y, { width: WIDTH });
      doc.moveDown(0.3);

      useFont(false, 9.5);
      doc.text(justification, LEFT, doc.y, { width: WIDTH, lineGap: 2 });
      doc.moveDown(0.6);
    }

    // ── Accused identifiers (Aadhaar, PAN, etc.) ──────────────────────────
    const identifiers: Array<{ type: string; value: string }> =
      Array.isArray(warrant.accused_identifiers) ? warrant.accused_identifiers : [];

    if (identifiers.length > 0) {
      checkPage(30);
      doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(0.3).stroke();
      doc.moveDown(0.4);

      useFont(true, 9.5);
      doc.text('ACCUSED IDENTIFIERS:', LEFT, doc.y, { width: WIDTH });
      doc.moveDown(0.3);

      for (const id of identifiers) {
        checkPage(16);
        useFont(false, 9.5);
        doc.text(`  ${id.type}: ${id.value}`, LEFT, doc.y, { width: WIDTH });
        doc.moveDown(0.2);
      }

      doc.moveDown(0.4);
    }

    // ── Signature / court seal block ───────────────────────────────────────
    // Ensure this lands near the bottom of a page (at least 100 pt space needed)
    if (doc.y > doc.page.height - 130) doc.addPage();
    const sigY = Math.max(doc.y + 30, doc.page.height - 120);

    doc.moveTo(LEFT, sigY).lineTo(RIGHT, sigY).lineWidth(0.5).stroke();

    useFont(false, 8.5);
    doc.text('(Seal of the Court)', LEFT, sigY + 8, {
      width: WIDTH / 2,
      align: 'center',
    });
    doc.text('(Signature of Magistrate)', LEFT + WIDTH / 2, sigY + 8, {
      width: WIDTH / 2,
      align: 'center',
    });

    // ── Footer ─────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 35;
    doc.moveTo(LEFT, footerY).lineTo(RIGHT, footerY).lineWidth(0.3).stroke();
    useFont(false, 7.5);
    doc.text(
      `Crime OS Platform — Gujarat Police  |  Warrant ID: ${warrant.warrant_id || '—'}  |  Generated: ${new Date().toLocaleString('en-IN')}`,
      LEFT,
      footerY + 6,
      { width: WIDTH, align: 'center' },
    );

    doc.end();
  });
}
