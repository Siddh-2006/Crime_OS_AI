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

    // 3. Complainant / Informant Details
if (chargeSheetData.section3_complainantDetails) {
  addSectionHeader('3. Complainant / Informant Details');

  const complainant = chargeSheetData.section3_complainantDetails;

  addTextRow(
    'Name',
    `${complainant.firstName || ''} ${complainant.lastName || ''}`.trim()
  );

  addTextRow(
    'Contact',
    `${complainant.phone || 'N/A'} | ${complainant.email || 'N/A'}`
  );

  addTextRow(
    'Address',
    complainant.address || 'N/A'
  );
}

    // 4. Victim Details
if (chargeSheetData.section4_victimDetails?.length > 0) {
  addSectionHeader('4. Victim Details');

  chargeSheetData.section4_victimDetails.forEach((victim: any, idx: number) => {
    addTextRow(`Victim ${idx + 1}`, ' ');
    addTextRow('Name', victim.name || 'N/A');
    addTextRow('Contact', `${victim.contact?.phone || 'N/A'} | ${victim.contact?.email || 'N/A'}`);
    addTextRow('Address', victim.contact?.address || 'N/A');

    if (victim.victimProfile?.injuryDetails) {
      addTextRow('Injuries', victim.victimProfile.injuryDetails);
    }

    if (victim.victimProfile?.lossDetails) {
      addTextRow('Loss', victim.victimProfile.lossDetails);
    }
  });
}

// 5. Accused Details
if (chargeSheetData.section5_accusedDetails?.length > 0) {
  addSectionHeader('5. Accused Details');

  chargeSheetData.section5_accusedDetails.forEach((accused: any, idx: number) => {
    addTextRow(`Accused ${idx + 1}`, ' ');
    addTextRow('Name', accused.name || 'N/A');
    addTextRow('Contact', `${accused.contact?.phone || 'N/A'} | ${accused.contact?.address || 'N/A'}`);
  });
}

// 6. Applicable Legal Sections
if (chargeSheetData.section6_applicableLegalSections?.length > 0) {
  addSectionHeader('6. Applicable Legal Sections');

  chargeSheetData.section6_applicableLegalSections.forEach((sec: any) => {
    addTextRow(
      sec.code || sec.section_code || 'Section',
      sec.title || sec.short_title || 'N/A'
    );
  });
}

    // 7. Investigation Summary
    addSectionHeader('7. Investigation Summary');
    addLongText(chargeSheetData.section7_investigationSummary);

// 8. Witnesses
if (chargeSheetData.section8_witnesses?.length > 0) {
  addSectionHeader('8. Witnesses');

  chargeSheetData.section8_witnesses.forEach((witness: any, idx: number) => {
    addTextRow(`Witness ${idx + 1}`, ' ');
    addTextRow('Name', witness.name || 'N/A');
    addTextRow('Contact', `${witness.contact?.phone || 'N/A'} | ${witness.contact?.address || 'N/A'}`);

    if (witness.witnessProfile?.statement) {
      addTextRow('Statement', witness.witnessProfile.statement);
    }
  });
}

// 9. Evidence Collected
if (chargeSheetData.section9_evidenceCollected?.length > 0) {
  addSectionHeader('9. Evidence Collected');

  chargeSheetData.section9_evidenceCollected.forEach((ev: any, idx: number) => {
    addTextRow(
      `${idx + 1}. ${ev.title || ev.evidence_id || ev.type || 'Evidence'}`,
      ev.description || ev.ai_description || ev.storage_ref || 'N/A'
    );
  });
}

// 10. Department Reports
if (chargeSheetData.section10_departmentReports?.length > 0) {
  addSectionHeader('10. Department Reports');

  chargeSheetData.section10_departmentReports.forEach((req: any, idx: number) => {
    addTextRow(
      `${idx + 1}. ${req.department || 'Department'}`,
      `${req.request_type || 'N/A'} - ${(req.status || 'N/A').toUpperCase()}`
    );
  });
}

    // 11. Investigation Findings
    addSectionHeader('11. Investigation Findings');
    addLongText(chargeSheetData.section11_investigationFindings);

    // 12. Sections Applied to Accused
if (chargeSheetData.section12_accusedAppliedSections?.length > 0) {
  addSectionHeader('12. Sections Applied to Accused');

  chargeSheetData.section12_accusedAppliedSections.forEach((entry: any, idx: number) => {
    const accused = chargeSheetData.section5_accusedDetails?.find(
      (a: any) => a._id === entry.accusedId || a.id === entry.accusedId
    );

    addTextRow(`Accused ${idx + 1}`, accused?.name || 'Unknown');

    if (entry.sections?.length > 0) {
      entry.sections.forEach((sec: any, sIdx: number) => {
        addTextRow(
          `Section ${sIdx + 1}`,
          `${sec.code || sec.section_code || 'N/A'} - ${sec.title || sec.short_title || 'N/A'}`
        );
      });
    } else {
      addTextRow('Sections', 'N/A');
    }
  });
}

    // 13. Final Report
    addSectionHeader('13. Final Report / Prayer');
    addLongText(chargeSheetData.section13_finalReport);

    // // 14. Annexures
    // addSectionHeader('14. Annexures');
    // chargeSheetData.section14_annexures.forEach((annex: any, idx: number) => {
    //   addTextRow(`${idx + 1}. ${annex.type}`, annex.title);
    // });

    doc.end();
  });
}
