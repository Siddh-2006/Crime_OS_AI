/**
 * warrantTemplateService.ts
 *
 * Generates the BNSS Form No. 2 "Warrant of Arrest" text from structured data.
 * This is a pure function — no I/O, no side-effects.
 *
 * The returned string is stored verbatim in ArrestWarrant.warrant_draft_content
 * and fed directly to warrantPdfService to produce the PDF attachment.
 * The two are always identical — warrant_draft_content IS the source of truth.
 */

export interface IWarrantTemplateInput {
  /** The IO who drafted the warrant (for the "To:" line). */
  officerName: string;
  officerRank: string;
  policeStation: string;
  district: string;

  /** Accused details. */
  accusedName: string;
  accusedAddress?: string;
  accusedIdentifiers?: Array<{ type: string; value: string }>;

  /** Applied legal sections from suspect/accused profile. */
  appliedSections?: Array<{ code: string; title: string; reason?: string }>;

  /** FIR reference. */
  firNumber: string;

  /** Why the IO is seeking this arrest — the only mandatory free-text input. */
  justification: string;

  /** Date to appear on the warrant face (ISO string or Date). Defaults to today. */
  warrantDate?: string | Date;
}

/**
 * Formats a Date (or ISO string) as "DD/MM/YYYY".
 */
function formatDate(value?: string | Date): string {
  const d = value ? new Date(value) : new Date();
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Builds the BNSS Form No. 2 warrant text.
 *
 * Reference format (BNSS Section 70 / CrPC Form No. 2):
 *
 *   WARRANT OF ARREST (See Section 70, BNSS)
 *
 *   To: [officer name & designation]
 *
 *   WHEREAS [accused] of [address] stands charged with the offence(s) of:
 *   [sections]
 *
 *   [Justification / Grounds]
 *
 *   FIR No.: [firNumber]
 *   Police Station: [station], District: [district]
 *
 *   You are hereby directed to arrest the said [accused] and to produce
 *   him/her before me/the Magistrate without delay.
 *
 *   Herein fail not.
 *
 *   Dated: [date]
 *   Place: [police station]
 *
 *   (Seal of the Court)          (Signature of Magistrate)
 */
export function buildWarrantDraftContent(input: IWarrantTemplateInput): string {
  const date = formatDate(input.warrantDate);

  // ── Accused identity block ───────────────────────────────────────────────
  const identifierLines = (input.accusedIdentifiers ?? [])
    .filter((id) => id.type && id.value)
    .map((id) => `  ${id.type}: ${id.value}`)
    .join('\n');

  const accusedBlock = [
    input.accusedName || '(Name unknown)',
    input.accusedAddress ? `of ${input.accusedAddress}` : '',
    identifierLines ? `Identifiers:\n${identifierLines}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  // ── Offences / sections block ────────────────────────────────────────────
  const sectionsBlock = (input.appliedSections ?? []).length > 0
    ? (input.appliedSections ?? [])
        .map((s, i) => {
          const reasonNote = s.reason ? ` — ${s.reason}` : '';
          return `  ${i + 1}. Section ${s.code}: ${s.title}${reasonNote}`;
        })
        .join('\n')
    : '  (Sections to be specified by the Magistrate)';

  // ── Compose full document ────────────────────────────────────────────────
  return [
    '═══════════════════════════════════════════════════════════════',
    '         WARRANT OF ARREST',
    '         (See Section 70, Bharatiya Nagarik Suraksha Sanhita, 2023)',
    '═══════════════════════════════════════════════════════════════',
    '',
    `To: ${input.officerRank} ${input.officerName}`,
    `    ${input.policeStation} Police Station, ${input.district}`,
    '',
    '───────────────────────────────────────────────────────────────',
    'WHEREAS',
    '',
    accusedBlock,
    '',
    'stands charged with the offence(s) of:',
    '',
    sectionsBlock,
    '',
    '───────────────────────────────────────────────────────────────',
    'GROUNDS FOR ARREST (Justification):',
    '',
    input.justification,
    '',
    '───────────────────────────────────────────────────────────────',
    `FIR No.       : ${input.firNumber}`,
    `Police Station: ${input.policeStation}, ${input.district}`,
    '',
    'You are hereby directed to arrest the said',
    `${input.accusedName || '(Accused)'}`,
    'and to produce him/her before the Court / Magistrate without',
    'delay and without fail.',
    '',
    'HEREIN FAIL NOT.',
    '',
    '───────────────────────────────────────────────────────────────',
    `Dated : ${date}`,
    `Place : ${input.policeStation}, ${input.district}`,
    '',
    '',
    '(Seal of the Court)                    (Signature of Magistrate)',
    '',
    '═══════════════════════════════════════════════════════════════',
  ].join('\n');
}
