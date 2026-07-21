import PDFDocument from 'pdfkit';
import { Response } from 'express';

export async function generateChargeSheetPdfStream(chargeSheetData: any, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ChargeSheet_${chargeSheetData.section1_filingInformation.firNumber || 'Draft'}.pdf`);

    doc.pipe(res);

    doc.on('end', resolve);
    doc.on('error', reject);

    const PAGE_W = doc.page.width;
    const MARGIN = 50;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    const DARK_BLUE = '#1a237e';
    const TEXT_DARK = '#111111';
    const TEXT_MID = '#444444';
    
    // Header
    doc.rect(MARGIN, MARGIN, CONTENT_W, 60).fill(DARK_BLUE);
    doc.fill('white').font('Helvetica-Bold').fontSize(18)
       .text('FINAL REPORT / CHARGE SHEET', MARGIN, MARGIN + 15, { width: CONTENT_W, align: 'center' });
    doc.fontSize(10).text('Under Section 173 CrPC', MARGIN, MARGIN + 35, { width: CONTENT_W, align: 'center' });

    let y = MARGIN + 80;

    const addSectionHeader = (title: string) => {
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = MARGIN;
      }
      doc.rect(MARGIN, y, CONTENT_W, 20).fill('#dddddd');
      doc.fill(DARK_BLUE).font('Helvetica-Bold').fontSize(11)
         .text(title, MARGIN + 5, y + 5, { width: CONTENT_W - 10 });
      y += 30;
    };

    const addTextRow = (label: string, text: string) => {
      if (y > doc.page.height - 50) {
        doc.addPage();
        y = MARGIN;
      }
      doc.font('Helvetica-Bold').fontSize(9).fill(TEXT_MID)
         .text(`${label}: `, MARGIN, y, { continued: true })
         .font('Helvetica').fill(TEXT_DARK)
         .text(text || 'N/A', { width: CONTENT_W });
      y = doc.y + 10;
    };

    const addLongText = (text: string) => {
      if (y > doc.page.height - 50) {
        doc.addPage();
        y = MARGIN;
      }
      doc.font('Helvetica').fontSize(9.5).fill(TEXT_DARK)
         .text(text || 'N/A', MARGIN, y, { width: CONTENT_W, align: 'justify' });
      y = doc.y + 15;
    };

    // 1. Filing Information
    addSectionHeader('1. Filing Information');
    const fInfo = chargeSheetData.section1_filingInformation;
    addTextRow('Charge Sheet No', fInfo.chargeSheetNumber);
    addTextRow('FIR No', fInfo.firNumber);
    addTextRow('Police Station', fInfo.policeStation);
    addTextRow('District', fInfo.district);
    addTextRow('Court', fInfo.court);
    addTextRow('Filing Date', fInfo.filingDate ? new Date(fInfo.filingDate).toLocaleDateString() : 'N/A');
    addTextRow('Investigating Officer', fInfo.investigatingOfficer);
    addTextRow('Status', fInfo.chargeSheetStatus);

    // 2. Case Particulars
    addSectionHeader('2. Case Particulars');
    const cPart = chargeSheetData.section2_caseParticulars;
    addTextRow('Brief Description', cPart.briefCaseDescription);
    addTextRow('Date of Occurrence', cPart.dateOfOccurrence ? new Date(cPart.dateOfOccurrence).toLocaleDateString() : 'N/A');
    addTextRow('Place of Occurrence', cPart.placeOfOccurrence);
    addTextRow('Nature of Offence', cPart.natureOfOffence);

    // 7. Investigation Summary
    addSectionHeader('7. Investigation Summary');
    addLongText(chargeSheetData.section7_investigationSummary);

    // 11. Investigation Findings
    addSectionHeader('11. Investigation Findings');
    addLongText(chargeSheetData.section11_investigationFindings);

    // 13. Final Report
    addSectionHeader('13. Final Report / Prayer');
    addLongText(chargeSheetData.section13_finalReport);

    // 14. Annexures
    addSectionHeader('14. Annexures');
    chargeSheetData.section14_annexures.forEach((annex: any, idx: number) => {
      addTextRow(`${idx + 1}. ${annex.type}`, annex.title);
    });

    doc.end();
  });
}
