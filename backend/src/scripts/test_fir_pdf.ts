import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { IFirFormData } from '../modules/investigation/services/firService';

function getFontPath(): string | null {
  const possiblePaths = [
    path.resolve(process.cwd(), 'src/assets/fonts/NotoSansGujarati.ttf'),
    path.resolve(process.cwd(), 'dist/assets/fonts/NotoSansGujarati.ttf'),
    path.join(__dirname, '../assets/fonts/NotoSansGujarati.ttf'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function sanitizeGujaratiText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\u0A85\u0A82/g, 'અન\u0ACD')  // અં → અન્
    .replace(/\u0A86\u0A82/g, 'આન\u0ACD')  // આં → આન્
    .replace(/\u0A87\u0A82/g, 'ઇન\u0ACD')  // ઇં → ઇન્
    .replace(/\u0A88\u0A82/g, 'ઈન\u0ACD')  // ઈં → ઈન્
    .replace(/\u0A89\u0A82/g, 'ઉન\u0ACD')  // ઉં → ઉન્
    .replace(/\u0A8A\u0A82/g, 'ઊન\u0ACD'); // ઊં → ઊન્
}

async function generateFirPdf(form: IFirFormData, lang: 'en' | 'guj'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const gujFontPath = getFontPath();
    const hasGuj = lang === 'guj' && gujFontPath !== null;

    if (hasGuj && gujFontPath) {
      doc.registerFont('GujaratiFont', gujFontPath);
    }

    const PAGE_W = doc.page.width;   // 595.28
    const LEFT = 40;
    const RIGHT = PAGE_W - 40;
    const WIDTH = RIGHT - LEFT;      // 515.28

    const clean = (t: string) => (lang === 'guj' ? sanitizeGujaratiText(t) : t);

    const useFont = (bold: boolean, size: number) => {
      if (hasGuj) {
        doc.font('GujaratiFont').fontSize(size);
      } else {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
      }
    };

    const checkPage = (needed = 60) => {
      if (doc.y > doc.page.height - needed) doc.addPage();
    };

    // Helper: section number label (e.g. "1)")
    const sectionLine = (num: string, text: string) => {
      checkPage(20);
      useFont(true, 9.5);
      doc.text(clean(num) + '  ', LEFT, doc.y, { continued: true });
      useFont(false, 9.5);
      doc.text(clean(text || '-----'), { width: WIDTH });
      doc.moveDown(0.2);
    };

    // Helper: sub-section "(1)" style
    const subLine = (num: string, label: string, value: string, indent = 15) => {
      checkPage(20);
      const lx = LEFT + indent;
      useFont(false, 9.5);
      if (label) {
        doc.text(clean(num) + '  ', lx, doc.y, { continued: true });
        useFont(true, 9.5);
        doc.text(clean(label) + ':-  ', { continued: true });
        useFont(false, 9.5);
        doc.text(clean(value || '-----'), { width: WIDTH - indent });
      } else {
        doc.text(clean(num) + '  ', lx, doc.y, { continued: true });
        doc.text(clean(value || '-----'), { width: WIDTH - indent });
      }
      doc.moveDown(0.2);
    };

    // Helper: paragraph block with indent
    const para = (text: string, indent = 28) => {
      checkPage(40);
      useFont(false, 9.5);
      doc.text(clean(text || ''), LEFT + indent, doc.y, {
        width: WIDTH - indent,
        align: 'left',
        lineGap: 2.5,
      });
      doc.moveDown(0.5);
    };

    // ─── PAGE HEADER ────────────────────────────────────────────────────────────
    const titleLine1 = lang === 'en' ? 'FIRST INFORMATION REPORT' : 'પ્રથમ માહિતી અહેવાલ';
    const titleLine2 = lang === 'en'
      ? '(Under Section 173 of the Bharatiya Nagarik Suraksha Sanhita)'
      : '(ભારતીય નાગરિક સુરક્ષા સંહિતાની કલમ-૧૭૩ હેઠળ)';

    useFont(true, 13);
    doc.text(clean(titleLine1), LEFT, doc.y, { width: WIDTH, align: 'center' });
    doc.moveTo(LEFT + 130, doc.y).lineTo(RIGHT - 130, doc.y).lineWidth(0.8).stroke();
    doc.moveDown(0.1);
    useFont(true, 10);
    doc.text(clean(titleLine2), LEFT, doc.y, { width: WIDTH, align: 'center' });
    doc.moveTo(LEFT + 80, doc.y).lineTo(RIGHT - 80, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.5);

    // ─── FIELD 1 — District / Station / Year / Complaint No / Date ───────────
    const f1label = lang === 'en' ? '1)' : '૧)';
    const f1content = lang === 'en'
      ? `District: ${form.district}   Police Station: ${form.policeStation}   Year: ${form.year}   Complaint No.: ${form.complaintNumber}   Date: ${form.firDate}`
      : `જિલ્લો: ${form.district}   પો.મ.થ.: ${form.policeStation}   વર્ષ: ${form.year}   ફરિયાદ નં.: ${form.complaintNumber}   તા.: ${form.firDate}`;
    sectionLine(f1label, f1content);
    doc.moveDown(0.2);

    // ─── FIELD 2 — Acts & Sections ───────────────────────────────────────────
    const f2label = lang === 'en' ? '2)' : '૨)';
    const f2sub = lang === 'en' ? '(1)   Act, Law, and Sections:-' : '(૧)   અધિનિયમ કાયદો અને કલમ:-';
    checkPage(30);
    useFont(true, 9.5);
    doc.text(clean(f2label) + '  ', LEFT, doc.y, { continued: true });
    doc.text(clean(f2sub) + '  ', { continued: true });
    useFont(false, 9.5);
    doc.text(clean(form.actAndSections || '-----'), { width: WIDTH });
    doc.moveDown(0.3);

    // ─── FIELD 3 — Period of Crime ───────────────────────────────────────────
    const f3label = lang === 'en' ? '3)' : '૩)';
    const f3sub1en = `(1)   Period of Crime:-         From ${form.crimeStartDate} at ${form.crimeStartTime} hrs to ${form.crimeEndDate} at ${form.crimeEndTime} hrs`;
    const f3sub1guj = `(૧)   ગુન્હો બન્યાનો સમયગાળો:-   ગઇ તા.${form.crimeStartDate} ના કલાક-${form.crimeStartTime} થી તા.${form.crimeEndDate} ના કલાક-${form.crimeEndTime} વાગ્યા દરમ્યાન`;
    checkPage(60);
    useFont(true, 9.5);
    doc.text(clean(f3label) + '  ', LEFT, doc.y, { continued: true });
    useFont(false, 9.5);
    doc.text(clean(lang === 'en' ? f3sub1en : f3sub1guj), { width: WIDTH });
    doc.moveDown(0.15);

    subLine(lang === 'en' ? '(2)' : '(૨)', lang === 'en' ? 'Date Information Received at Police Station' : 'પોલીસ મથકે માહિતી મળ્યા તારીખ', form.dateInfoReceived);
    subLine(lang === 'en' ? '(3)' : '(૩)', lang === 'en' ? 'Station Diary Entry Number' : 'સ્ટેશન ડાયરી એન્ટ્રી નંબર', `${form.stationDiaryEntryNumber}   Time: 10:20 PSO`);
    doc.moveDown(0.2);

    // ─── FIELD 4 — Information Type ─────────────────────────────────────────
    const f4label = lang === 'en' ? '4)' : '૪)';
    const f4text = lang === 'en' ? `Type of Information (Written/Oral):-    ${form.informationType}` : `માહિતી નો પ્રકાર (લેખિત/મૌખિક):-    ${form.informationType === 'Oral' ? 'મૌખિક' : 'લેખિત'}`;
    sectionLine(f4label, f4text);
    doc.moveDown(0.2);

    // ─── FIELD 5 — Place of Incident ─────────────────────────────────────────
    const f5label = lang === 'en' ? '5)' : '૫)';
    checkPage(30);
    useFont(true, 9.5);
    doc.text(clean(f5label) + '  ', LEFT, doc.y, { continued: true });
    doc.text(clean(lang === 'en' ? 'Place of Incident:-' : 'ઘટનાનું સ્થળ:-'), { width: WIDTH });
    doc.moveDown(0.15);

    subLine(lang === 'en' ? '(1)' : '(૧)', lang === 'en' ? 'Direction and Distance from Police Station' : 'પોલીસ મથકની દિશા અંતર', form.directionDistanceFromStation);
    subLine(lang === 'en' ? '(2)' : '(૨)', lang === 'en' ? 'Address' : 'સરનામું', form.incidentAddress);
    subLine(lang === 'en' ? '(3)' : '(૩)', lang === 'en' ? 'Outside Police Station Limits (if applicable): District' : 'પોલીસ સ્ટેશનની હદની બહાર હોય તો તે પોલીસ સ્ટેશનનું નામ   જિલ્લો', form.outsideJurisdiction);
    doc.moveDown(0.2);

    // ─── FIELD 6 — Complainant Details ──────────────────────────────────────
    const f6label = lang === 'en' ? '6)' : '૬)';
    checkPage(30);
    useFont(true, 9.5);
    doc.text(clean(f6label) + '  ', LEFT, doc.y, { continued: true });
    doc.text(clean(lang === 'en' ? 'Complainant / Informant Details:' : 'ફરિયાદી/બાતમીદાર:'), { width: WIDTH });
    doc.moveDown(0.15);

    subLine(lang === 'en' ? '(1)' : '(૧)', lang === 'en' ? 'Name' : 'નામ', form.complainantName);
    subLine(lang === 'en' ? '(2)' : '(૨)', lang === 'en' ? "Father's Name" : 'પિતાનું નામ', form.complainantFatherName);
    subLine(lang === 'en' ? '(3)' : '(૩)', lang === 'en' ? 'Date/Year of Birth' : 'જન્મ તારીખ/વર્ષ', form.complainantDOB);
    subLine(lang === 'en' ? '(4)' : '(૪)', lang === 'en' ? 'Nationality' : 'રાષ્ટ્રીયતા', form.complainantNationality);

    const passportLine = lang === 'en'
      ? `Passport Number: ${form.complainantPassportNumber}   Issue Date: ${form.complainantPassportIssueDate}   Issue Place: ${form.complainantPassportIssuePlace}`
      : `પાસપોર્ટ નંબર: ${form.complainantPassportNumber}   જારી તારીખ: ${form.complainantPassportIssueDate}   જારી કર્યા સ્થળ: ${form.complainantPassportIssuePlace}`;
    subLine(lang === 'en' ? '(5)' : '(૫)', '', passportLine);

    subLine(lang === 'en' ? '(6)' : '(૬)', lang === 'en' ? 'Occupation' : 'ધંધો', form.complainantOccupation);
    subLine(lang === 'en' ? '(7)' : '(૭)', lang === 'en' ? 'Address' : 'સરનામું', `${form.complainantAddress}   Mobile: ${form.complainantMobileNumbers}`);
    doc.moveDown(0.3);

    // ─── FIELD 7 — Accused Details ───────────────────────────────────────────
    const f7label = lang === 'en' ? '7)' : '૭)';
    checkPage(40);
    useFont(true, 9.5);
    doc.text(clean(f7label) + '  ', LEFT, doc.y, { continued: true });
    doc.text(clean(lang === 'en' ? 'Details of Known / Suspected / Unknown Accused:' : 'ઓળખેલ/શકમંદ/વણઓળખેલ આરોપીની તમામ વિગતો સાથેની માહિતી'), { width: WIDTH });
    doc.moveDown(0.15);
    para(form.accusedDetails, 20);
    doc.moveDown(0.2);

    // ─── FIELD 8 — Delay Reason ─────────────────────────────────────────────
    const f8label = lang === 'en' ? '8)' : '૮)';
    checkPage(30);
    useFont(true, 9.5);
    doc.text(clean(f8label) + '  ', LEFT, doc.y, { continued: true });
    doc.text(clean(lang === 'en' ? 'Reasons for Delay in Reporting the Offense:-' : 'ફરિયાદી / બાતમીદાર તરફથી ગુન્હાની જાણ કરવામાં વિલંબ થવાના કારણો:-'), { width: WIDTH });
    doc.moveDown(0.1);
    para(form.delayReason, 20);
    doc.moveDown(0.1);

    // ─── FIELDS 9-10 — Stolen Property ──────────────────────────────────────
    sectionLine(lang === 'en' ? '9)' : '૯)', `${lang === 'en' ? 'Details of Stolen / Involved Assets:' : 'ચોરાયેલી/ગુન્હામાં સંડોવાયેલ ચીજ વસ્તુઓની વિગત'}   ${form.stolenPropertyDetails}`);
    sectionLine(lang === 'en' ? '10)' : '૧૦)', `${lang === 'en' ? 'Total Value of Stolen / Involved Assets:' : 'ચોરાયેલી /ગુન્હામાં સંડોવાયેલ ચીજ વસ્તુની ફૂલ કિંમત'}   ${form.stolenPropertyValue}`);
    sectionLine(lang === 'en' ? '11)' : '૧૧)', `${lang === 'en' ? 'Inquest Report / Accidental Death Number (if any):' : 'મૃત્યુ વિષયક તપાસ અહેવાલ/અકસ્માત મોતનો નંબર હોય તો તે.'}   ${form.inquestReportNumber}`);
    doc.moveDown(0.3);

    // ─── FIELD 12 — FIR Statement ────────────────────────────────────────────
    const f12label = lang === 'en' ? '12)' : '૧૨)';
    checkPage(80);
    useFont(true, 9.5);
    doc.text(clean(f12label) + '  ', LEFT, doc.y, { continued: true });
    doc.text(clean(lang === 'en' ? 'Details of First Information Report (Attach separate sheet if required):' : 'પ્રથમ માહિતી અહેવાલની વિગત (જરૂ જણાય તો અલાયદો કાગળ જોડવો)'), { width: WIDTH });
    doc.moveDown(0.4);

    useFont(true, 10);
    doc.text(clean(`${lang === 'en' ? 'Date:' : 'તા.'} ${form.firStatementDate}`), LEFT, doc.y, {
      width: WIDTH,
      align: 'center',
    });
    doc.moveDown(0.4);

    const narrative = lang === 'en' ? form.firStatementEn : form.firStatement;
    const paragraphs = (narrative || '').split('\n').filter((p) => p.trim().length > 0);
    for (const p of paragraphs) {
      checkPage(40);
      useFont(false, 9.5);
      doc.text(clean(p.trim()), LEFT + 28, doc.y, {
        width: WIDTH - 28,
        align: 'left',
        lineGap: 2.5,
      });
      doc.moveDown(0.5);
    }

    // Closing line
    checkPage(60);
    const closingLine = lang === 'en'
      ? 'The statement recorded above is true and correct as dictated by me.'
      : 'એટલી મારી હકીકત મારા લખ્યાવ્યા મુજબની બરાબર અને ખરી છે.';
    useFont(false, 9.5);
    doc.text(clean(closingLine), LEFT + 28, doc.y, { width: WIDTH - 28, align: 'left' });
    doc.moveDown(0.3);

    useFont(true, 9.5);
    doc.text(clean(lang === 'en' ? 'In Person:' : 'રૂબરૂ:'), LEFT, doc.y, { width: 120 });
    doc.moveDown(0.5);

    checkPage(80);
    const sigY = doc.y;
    doc.text('......................................................', LEFT, sigY, { width: 200 });

    const officerBlock = lang === 'en'
      ? `Police Station Officer\n${form.policeStation}`
      : `પો.સ્ટે.અમલદાર\n${form.policeStation}`;
    useFont(false, 9.5);
    doc.text(clean(officerBlock), LEFT + 320, sigY, { width: 200, align: 'right' });
    doc.moveDown(1.2);

    // ─── FIELD 13 — Action Taken ─────────────────────────────────────────────
    const f13label = lang === 'en' ? '13)' : '૧૩)';
    checkPage(100);
    useFont(true, 9.5);
    doc.text(clean(f13label) + '  ', LEFT, doc.y, { continued: true });
    const f13header = lang === 'en'
      ? 'Action Taken: Since an offense described in Item No. (2) above is disclosed:'
      : 'લીઘેલ પગલાં : ઉપરના અહેવાલની ઉપરની આઈટમ નં. (૨) માં જણાવ્યા પ્રમાણોનો ગુન્હો બન્યાનું જણાઇ આવતા.';
    useFont(false, 9.5);
    doc.text(clean(f13header), { width: WIDTH });
    doc.moveDown(0.3);

    subLine(lang === 'en' ? '(1)' : '(૧)', '', lang === 'en' ? 'Registered the case and initiated investigation.' : 'કેસની નોંધણી કરી તપાસ હાથ ધરી છે.');
    subLine(lang === 'en' ? '(2)' : '(૨)', lang === 'en' ? 'Investigating Officer Name' : 'તપાસ કરનાર અધિકારીનું નામ', `${form.investigatingOfficerName},  ${lang === 'en' ? 'Rank' : 'હોદ્દો'}: ${form.investigatingOfficerRank}`);
    subLine(lang === 'en' ? '(3)' : '(૩)', lang === 'en' ? 'Reasons for non-investigation' : 'તપાસ ન થઈ શકવાના કારણો', '-----');
    subLine(lang === 'en' ? '(4)' : '(૪)', lang === 'en' ? 'Transferred to Police Station' : 'તબદીલ કરેલ છે તે પો.સ્ટે.', `-----   ${lang === 'en' ? 'District' : 'જિલ્લો'}`);
    doc.moveDown(0.4);

    const roacPara = lang === 'en'
      ? 'The FIR was read over to the complainant/informant, who agreed it was accurately recorded, and a free copy was provided.'
      : 'પ્રથમ માહિતી અહેવાલ ફરિયાદી/બાતમીદારને વાંચી સભળાવેલ છે અને ફરિયાદીએ લખ્યાવ્યા પ્રમાણેજ નોંધવામાં આવેલ છે. તેવું ફરિયાદી/બાતમીદારે સ્વીકારેલ છે અને ફરિયાદી/બાતમીદારને તેની નકલ વિના મૂલ્યે આપવામાં આવી છે.';
    para(roacPara, 20);
    doc.moveDown(0.4);

    // Signature Block
    checkPage(80);
    const endY = doc.y;
    useFont(false, 9);
    doc.text(clean(lang === 'en' ? 'Complainant / Informant Signature' : 'ફરિયાદી / બાતમીદાર ની સહી કે અંગુઠાનું નિશાન'), LEFT, endY, { width: 220 });
    doc.text('......................................................', LEFT, endY + 15, { width: 220 });

    const shoBlock = lang === 'en'
      ? `Officer in Charge: ${form.officerInChargeName}\nRank: ${form.officerInChargeRank}   Buckle No.: ${form.officerInChargeBuckleNumber}`
      : `પોલીસ સ્ટેશન ના ઇન્ચાર્જ અધિકારી: ${form.officerInChargeName}\nહોદ્દો: ${form.officerInChargeRank}   બકલ નં.: ${form.officerInChargeBuckleNumber}`;
    doc.text(clean(shoBlock), LEFT + 260, endY, { width: 250, align: 'right' });
    doc.moveDown(1.5);

    // ─── FIELD 15 — Court Date ───────────────────────────────────────────────
    const f15label = lang === 'en' ? '15)' : '૧૫)';
    sectionLine(f15label, lang === 'en' ? `Date and Time of Dispatch to Court:   ${form.dateSentToCourt}` : `કોર્ટમાં મોકલ્યા તારીખ અને સમય:   ${form.dateSentToCourt}`);
    doc.moveDown(0.5);

    // ─── BRIEF SUMMARY BOX ──────────────────────────────────────────────────
    checkPage(80);
    const boxY = doc.y;
    useFont(true, 10);
    doc.text(clean(lang === 'en' ? 'Brief Summary of Offense:' : 'ગુન્હાની સંક્ષિપ્ત વિગત:'), LEFT, boxY);
    doc.moveDown(0.2);
    const summaryText = lang === 'en' ? form.briefSummary : form.briefSummaryGujEn;
    para(summaryText, 0);

    doc.end();
  });
}

async function run() {
  const dummyForm: IFirFormData = {
    district: 'Ahmedabad',
    policeStation: 'Sardarnagar Police Station',
    year: 2026,
    complaintNumber: 'COMP-a8cc08a6-768e-4745-8e33-85cb1a6f3ae3',
    firDate: '08/08/2026',
    firNumber: 'COMP-a8cc08a6-768e-4745-8e33-85cb1a6f3ae3',
    actAndSections: 'BNS S-190: Cat, BNS S-318: Cheating, IT Act S-66D: Computer Fraud',
    crimeStartDate: '12/10/2024',
    crimeStartTime: '22:30',
    crimeEndDate: '24/10/2024',
    crimeEndTime: '18:00',
    dateInfoReceived: '08/08/2026',
    stationDiaryEntryNumber: '____/2026',
    informationType: 'Oral',
    directionDistanceFromStation: '-----',
    incidentAddress: 'Devarshi 1/14 Avenue, Ambika Niketan Road, Pale Point, Surat',
    outsideJurisdiction: '-----',
    complainantName: 'Govardhan Dahyabhai Reshamwala',
    complainantFatherName: 'Dahyabhai',
    complainantDOB: '15/01/1934 (Age: 90 years)',
    complainantNationality: 'Indian',
    complainantPassportNumber: '-----',
    complainantPassportIssueDate: '-----',
    complainantPassportIssuePlace: '-----',
    complainantOccupation: '-----',
    complainantAddress: 'Saibaba Nagar, Mumbai',
    complainantMobileNumbers: '9892362104',
    accusedDetails: '(1) Name: Rahul Kumar | Role: Suspect — Fraudster identifying as DHL Courier representative via phone +91 9952630491\n(2) Name: Rajesh Pradhan | Role: Suspect — Fraudster impersonating fake Mumbai Police officer (badge no. 62000)\n(3) Name: Prakash Agarwal | Role: Suspect — Fraudster posing as CBI Director intimidating victim',
    delayReason: 'Complainant was under extreme coercion and mental distress.',
    stolenPropertyDetails: 'RTGS Transfers to fraudulently provided bank accounts',
    stolenPropertyValue: 'Rs. 1,15,500,000/-',
    inquestReportNumber: '-----',
    firStatementDate: '08/08/2026',
    firStatement: 'હું અત્રે પો.સ્ટે. આવી રૂબરૂ હકીકત જણાવું છું કે... જે અંગે State Bank of India ના ખાતામાંથી રૂ. 1,15,50,000/- ટ્રાન્સફર થઇ ગયેલ છે.\n\nએટલી મારી હકીકત મારા લખ્યાવ્યા મુજબની બરાબર અને ખરી છે.',
    firStatementEn: 'I am stating the facts in person at the Police Station that the complainant Govardhan Dahyabhai Reshamwala, aged 90 years, received a call from +91 9952630491 claiming a parcel containing illegal items was intercepted...\n\nThe above statement is true and correct as dictated by me.',
    investigatingOfficerName: '-----',
    investigatingOfficerRank: 'Police Inspector',
    officerInChargeName: '-----',
    officerInChargeRank: 'Inspector',
    officerInChargeBuckleNumber: '-----',
    dateSentToCourt: '-----',
    briefSummary: 'Digital arrest fraud amounting to Rs. 1.15 Crores.',
    briefSummaryGujEn: 'ડિજિટલ અરેસ્ટ સાયબર ફ્રોડ દ્વારા રૂ. ૧.૧૫ કરોડની છેતરપિંડી.',
  };

  console.log('Generating Fixed English FIR PDF...');
  const bufEn = await generateFirPdf(dummyForm, 'en');
  fs.writeFileSync('test_fir_en.pdf', bufEn);
  console.log('🎉 SUCCESSFULLY generated test_fir_en.pdf (Size: ' + bufEn.length + ' bytes)');

  console.log('Generating Fixed Gujarati FIR PDF...');
  const bufGuj = await generateFirPdf(dummyForm, 'guj');
  fs.writeFileSync('test_fir_guj.pdf', bufGuj);
  console.log('🎉 SUCCESSFULLY generated test_fir_guj.pdf (Size: ' + bufGuj.length + ' bytes)');
}

run();
