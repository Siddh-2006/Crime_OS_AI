'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Download, FileText, RefreshCw, X } from 'lucide-react';
import apiClient from '@/lib/axios';
import { Button } from '@/components/ui/Button';

interface ChargeSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
}

export default function ChargeSheetModal({ isOpen, onClose, caseId }: ChargeSheetModalProps) {
  const [data, setData] = useState<any>(null);
  const [draftData, setDraftData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const updateDraft = (path: Array<string | number>, value: any) => {
    setDraftData((prev: any) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      let node: any = next;
      for (let i = 0; i < path.length - 1; i += 1) {
        const key = path[i];
        if (node[key] === undefined || node[key] === null) {
          node[key] = typeof path[i + 1] === 'number' ? [] : {};
        }
        node = node[key];
      }
      node[path[path.length - 1]] = value;
      return next;
    });
  };

  const setDraft = (source: any) => {
    setData(source);
    setDraftData(source ? JSON.parse(JSON.stringify(source)) : null);
  };

  const handlePreviewPdf = async (): Promise<string | null> => {
    if (!draftData) return null;
    setPreviewLoading(true);
    setError('');
    if (previewPdfUrl) {
      window.URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }

    try {
      const res = await apiClient.post(`/cases/${caseId}/chargesheet/pdf`, { chargeSheet: draftData }, {
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setPreviewPdfUrl(blobUrl);
      return blobUrl;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to generate charge sheet preview PDF.');
      return null;
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewPdfUrl) {
        window.URL.revokeObjectURL(previewPdfUrl);
      }
    };
  }, [previewPdfUrl]);

  const sectionNumbers = useMemo(() => {
    const source = draftData ?? data;
    const numbers: Record<string, number | null> = {};
    let counter = 0;

    const addSection = (visible: boolean, key: string) => {
      if (!visible) return;
      counter += 1;
      numbers[key] = counter;
    };

    addSection(true, 'filingInformation');
    addSection(true, 'caseParticulars');
    addSection(Boolean(source?.section3_complainantDetails), 'complainantDetails');
    addSection(Boolean(source?.section4_victimDetails?.length), 'victimDetails');
    addSection(Boolean(source?.section5_accusedDetails?.length), 'accusedDetails');
    addSection(Boolean(source?.section6_applicableLegalSections?.length), 'applicableLegalSections');
    addSection(Boolean(source?.section7_evidenceLinkedSections?.length), 'evidenceLinkedSections');
    addSection(true, 'investigationSummary');
    addSection(Boolean(source?.section9_witnesses?.length), 'witnesses');
    addSection(Boolean(source?.section10_evidenceCollected?.length), 'evidenceCollected');
    addSection(Boolean(source?.section11_departmentReports?.length), 'departmentReports');
    addSection(true, 'investigationFindings');
    addSection(Boolean(source?.section13_accusedAppliedSections?.length), 'accusedAppliedSections');
    addSection(true, 'finalReport');
    addSection(Boolean(source?.section15_annexures?.length), 'annexures');

    return numbers;
  }, [data, draftData]);

  const fetchChargeSheet = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get(`/cases/${caseId}/chargesheet`);
      setDraft(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch charge sheet.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm('Are you sure you want to regenerate the Charge Sheet? This will invoke the AI model and create a new version.')) return;
    setRegenLoading(true);
    setError('');
    try {
      await apiClient.post(`/cases/${caseId}/chargesheet/regenerate`);
      await fetchChargeSheet();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to regenerate charge sheet.');
    } finally {
      setRegenLoading(false);
    }
  };

  const handlePreviewModal = async () => {
    if (!draftData?.section1_filingInformation?.magistrate?.trim()) {
      setError('Magistrate is required before generating a charge sheet PDF.');
      return;
    }
    if (!draftData?.section1_filingInformation?.court?.trim()) {
      setError('Court is required before generating a charge sheet PDF.');
      return;
    }
    await handlePreviewPdf();
  };

const handleDownload = async () => {
    setError('');
    try {
      const blobUrl = previewPdfUrl ?? (await handlePreviewPdf());
      if (!blobUrl) return; // TypeScript narrows `blobUrl` to `string` after this line

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `ChargeSheet_${data?.section1_filingInformation?.firNumber || 'Draft'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to download charge sheet PDF.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchChargeSheet();
    }
  }, [isOpen, caseId]);

  if (!isOpen) return null;

  const view = draftData ?? data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay-bg backdrop-blur-sm">
      <div className="bg-surface rounded-xl shadow-card w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-border">
        <div className="p-4 border-b border-border flex justify-between items-center bg-surface-elevated/80">
          <div className="flex items-center gap-2 text-text-primary">
            <FileText className="w-5 h-5 text-brand-primary" />
            <h2 className="text-lg font-bold text-text-primary">Final Report / Charge Sheet</h2>
            {view?.section1_filingInformation?.version && (
              <span className="bg-brand-primary/10 text-brand-primary text-xs px-2 py-1 rounded-full font-medium border border-brand-primary/20">
                v{view.section1_filingInformation.version}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-elevated rounded-lg transition-colors border border-transparent hover:border-border"
            aria-label="Close charge sheet"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-background">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-text-secondary font-medium text-sm">Loading Charge Sheet...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-semantic-critical/10 text-semantic-critical rounded-lg border border-semantic-critical/30 text-center">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-6 max-w-3xl mx-auto bg-surface p-8 rounded-lg shadow-card border border-border text-text-primary">
              <div className="text-center mb-8 border-b border-border pb-4">
                <h1 className="text-2xl font-black uppercase tracking-wider text-text-primary">FINAL REPORT</h1>
                <p className="text-sm font-medium text-text-secondary mt-1 uppercase tracking-widest">Under Section 173 CrPC</p>
              </div>

              <section>
                <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 text-text-primary">{sectionNumbers.filingInformation ?? 1}. Filing Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-semibold text-text-secondary">Charge Sheet No:</span> {view?.section1_filingInformation?.chargeSheetNumber}</div>
                  <div><span className="font-semibold text-text-secondary">FIR No:</span> {view?.section1_filingInformation?.firNumber}</div>
                  <div><span className="font-semibold text-text-secondary">Police Station:</span> {view?.section1_filingInformation?.policeStation}</div>
                  <div><span className="font-semibold text-text-secondary">Filing Date:</span> {view?.section1_filingInformation?.filingDate ? new Date(view.section1_filingInformation.filingDate).toLocaleDateString() : 'N/A'}</div>
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Magistrate</label>
                    <input
                      type="text"
                      value={view?.section1_filingInformation?.magistrate || ''}
                      onChange={(e) => updateDraft(['section1_filingInformation', 'magistrate'], e.target.value)}
                      className="w-full rounded-md border border-input-border bg-input-bg p-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring/30"
                      placeholder="Enter Magistrate's name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1">Court</label>
                    <input
                      type="text"
                      value={view?.section1_filingInformation?.court || ''}
                      onChange={(e) => updateDraft(['section1_filingInformation', 'court'], e.target.value)}
                      className="w-full rounded-md border border-input-border bg-input-bg p-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring/30"
                      placeholder="Enter court name"
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.caseParticulars ?? 2}. Case Particulars</h3>
                <div className="text-sm space-y-2 text-text-primary">
                  <p><span className="font-semibold text-text-secondary">Nature of Offence:</span> {view?.section2_caseParticulars?.natureOfOffence}</p>
                  <p><span className="font-semibold text-text-secondary">Date/Time:</span> {view?.section2_caseParticulars?.dateOfOccurrence ? new Date(view.section2_caseParticulars.dateOfOccurrence).toLocaleDateString() : ''} {view?.section2_caseParticulars?.timeOfOccurrence}</p>
                  <p><span className="font-semibold text-text-secondary">Place:</span> {view?.section2_caseParticulars?.placeOfOccurrence}</p>
                  <div>
                    <span className="font-semibold text-text-secondary">Brief Description:</span>
                    <p className="mt-1 text-justify text-text-primary bg-surface-elevated p-3 rounded border border-border">{view?.section2_caseParticulars?.briefCaseDescription}</p>
                  </div>
                </div>
              </section>

              {view?.section3_complainantDetails && (
                <section>
                  <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.complainantDetails ?? 3}. Complainant / Informant Details</h3>
                  <div className="text-sm space-y-1 text-text-primary">
                    <p><span className="font-semibold text-text-secondary">Name:</span> {view.section3_complainantDetails.firstName} {view.section3_complainantDetails.lastName}</p>
                    <p><span className="font-semibold text-text-secondary">Contact:</span> {view.section3_complainantDetails.phone} | {view.section3_complainantDetails.email}</p>
                    <p><span className="font-semibold text-text-secondary">Address:</span> {view.section3_complainantDetails.address}</p>
                  </div>
                </section>
              )}

              {view?.section4_victimDetails?.length > 0 && (
                <section>
                  <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.victimDetails ?? 4}. Victim Details</h3>
                  <div className="space-y-3">
                    {view.section4_victimDetails.map((victim: any, idx: number) => (
                      <div key={idx} className="text-sm p-3 bg-surface-elevated rounded border border-border">
                        <p><span className="font-semibold text-text-secondary">Name:</span> {victim.name}</p>
                        <p><span className="font-semibold text-text-secondary">Contact:</span> {victim.contact?.phone} | {victim.contact?.email}</p>
                        <p><span className="font-semibold text-text-secondary">Address:</span> {victim.contact?.address}</p>
                        {victim.victimProfile?.injuryDetails && <p><span className="font-semibold text-text-secondary">Injuries:</span> {victim.victimProfile.injuryDetails}</p>}
                        {victim.victimProfile?.lossDetails && <p><span className="font-semibold text-text-secondary">Loss:</span> {victim.victimProfile.lossDetails}</p>}
                        {Array.isArray(victim.statements) && victim.statements.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="font-semibold text-text-secondary text-xs uppercase tracking-wide">Statements</p>
                            {victim.statements.map((stmt: any, sIdx: number) => (
                              <div key={sIdx} className="bg-surface border border-border rounded p-2">
                                <p className="text-xs text-text-muted mb-0.5">{stmt.recordedAt ? new Date(stmt.recordedAt).toLocaleString('en-IN') : ''}</p>
                                <p className="italic text-text-primary">{stmt.content}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {Array.isArray(victim.reasoning) && victim.reasoning.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="font-semibold text-text-secondary text-xs uppercase tracking-wide">Reasoning</p>
                            {victim.reasoning.map((r: any, rIdx: number) => (
                              <div key={rIdx} className="bg-brand-primary/10 border border-brand-primary/20 rounded p-2 text-xs text-text-primary">
                                <span className="font-semibold text-brand-primary mr-1">[{r.source === 'ai' ? 'AI' : 'Officer'}]</span>{r.content}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {view?.section5_accusedDetails?.length > 0 && (
                <section>
                  <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.accusedDetails ?? 5}. Accused Details</h3>
                  <div className="space-y-3">
                    {view.section5_accusedDetails.map((accused: any, idx: number) => (
                      <div key={idx} className="text-sm p-3 bg-surface-elevated rounded border border-border">
                        <p><span className="font-semibold text-text-secondary">Name:</span> {accused.name}</p>
                        <p><span className="font-semibold text-text-secondary">Contact:</span> {accused.contact?.phone} | {accused.contact?.address}</p>
                        {Array.isArray(accused.statements) && accused.statements.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="font-semibold text-text-secondary text-xs uppercase tracking-wide">Statements</p>
                            {accused.statements.map((stmt: any, sIdx: number) => (
                              <div key={sIdx} className="bg-surface border border-border rounded p-2">
                                <p className="text-xs text-text-muted mb-0.5">{stmt.recordedAt ? new Date(stmt.recordedAt).toLocaleString('en-IN') : ''}</p>
                                <p className="italic text-text-primary">{stmt.content}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {Array.isArray(accused.reasoning) && accused.reasoning.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="font-semibold text-text-secondary text-xs uppercase tracking-wide">Reasoning</p>
                            {accused.reasoning.map((r: any, rIdx: number) => (
                              <div key={rIdx} className="bg-brand-primary/10 border border-brand-primary/20 rounded p-2 text-xs text-text-primary">
                                <span className="font-semibold text-brand-primary mr-1">[{r.source === 'ai' ? 'AI' : 'Officer'}]</span>{r.content}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {view?.section6_applicableLegalSections?.length > 0 && (
                <section>
                  <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.applicableLegalSections ?? 6}. Applicable Legal Sections</h3>
                  <div className="text-sm text-text-primary">
                    <ul className="list-disc pl-5 space-y-1">
                      {view.section6_applicableLegalSections.map((sec: any, idx: number) => (
                        <li key={idx}><span className="font-semibold">{sec.code || sec.section_code}</span> - {sec.title || sec.short_title}</li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}

              {view?.section7_evidenceLinkedSections?.length > 0 && (
                <section>
                  <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.evidenceLinkedSections ?? 7}. Evidence-linked BSA Sections</h3>
                  <div className="space-y-3">
                    {view.section7_evidenceLinkedSections.map((entry: any, idx: number) => (
                      <div key={idx} className="text-sm p-3 bg-surface-elevated rounded border border-border">
                        <p className="font-semibold text-text-primary">{entry.title || entry.evidence_id || 'Evidence'}</p>
                        {entry.applicable_sections?.length > 0 ? (
                          <ul className="list-disc pl-5 mt-2 space-y-1">
                            {entry.applicable_sections.map((sec: any, sIdx: number) => (
                              <li key={sIdx}><span className="font-semibold">{sec.code}</span> - {sec.title}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-text-secondary mt-2 text-xs">No linked statutory sections yet.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.investigationSummary ?? 8}. Investigation Summary</h3>
                <div className="text-sm text-justify text-text-primary whitespace-pre-wrap">{view?.section8_investigationSummary || 'No summary available.'}</div>
              </section>

              {view?.section9_witnesses?.length > 0 && (
                <section>
                  <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.witnesses ?? 9}. Witnesses & Participant Statements</h3>
                  <div className="space-y-3">
                    {view.section9_witnesses.map((witness: any, idx: number) => (
                      <div key={idx} className="text-sm p-3 bg-surface-elevated rounded border border-border">
                        <p><span className="font-semibold text-text-secondary">Name:</span> {witness.name}</p>
                        <p><span className="font-semibold text-text-secondary">Contact:</span> {witness.contact?.phone} | {witness.contact?.address}</p>
                        {Array.isArray(witness.statements) && witness.statements.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="font-semibold text-text-secondary text-xs uppercase tracking-wide">Statements</p>
                            {witness.statements.map((stmt: any, sIdx: number) => (
                              <div key={sIdx} className="bg-surface border border-border rounded p-2">
                                <p className="text-xs text-text-muted mb-0.5">{stmt.recordedAt ? new Date(stmt.recordedAt).toLocaleString('en-IN') : ''}</p>
                                <p className="italic text-text-primary">{stmt.content}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {!Array.isArray(witness.statements) || witness.statements.length === 0 ? (
                          witness.witnessProfile?.statement && (
                            <p className="mt-1"><span className="font-semibold text-text-secondary">Statement:</span> <span className="italic">{witness.witnessProfile.statement}</span></p>
                          )
                        ) : null}
                        {Array.isArray(witness.reasoning) && witness.reasoning.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="font-semibold text-text-secondary text-xs uppercase tracking-wide">Reasoning</p>
                            {witness.reasoning.map((r: any, rIdx: number) => (
                              <div key={rIdx} className="bg-brand-primary/10 border border-brand-primary/20 rounded p-2 text-xs text-text-primary">
                                <span className="font-semibold text-brand-primary mr-1">[{r.source === 'ai' ? 'AI' : 'Officer'}]</span>{r.content}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {view?.section10_evidenceCollected?.length > 0 && (
                <section>
                  <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.evidenceCollected ?? 10}. Evidence Collected</h3>
                  <ul className="list-disc pl-5 text-sm space-y-1 text-text-primary">
                    {view.section10_evidenceCollected.map((ev: any, idx: number) => (
                      <li key={idx}><span className="font-semibold">{ev.title || ev.evidence_id || ev.type}:</span> {ev.description || ev.ai_description || ev.storage_ref}</li>
                    ))}
                  </ul>
                </section>
              )}

              {view?.section11_departmentReports?.length > 0 && (
                <section>
                  <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.departmentReports ?? 11}. Department Reports</h3>
                  <ul className="list-disc pl-5 text-sm space-y-1 text-text-primary">
                    {view.section11_departmentReports.map((req: any, idx: number) => (
                      <li key={idx}><span className="font-semibold">{req.department}:</span> {req.request_type} - <span className="uppercase text-xs text-text-secondary">{req.status}</span></li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.investigationFindings ?? 12}. Investigation Findings</h3>
                <div className="text-sm text-justify text-text-primary whitespace-pre-wrap">{view?.section12_investigationFindings || 'No findings available.'}</div>
              </section>

              {view?.section13_accusedAppliedSections?.length > 0 && (
                <section>
                  <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.accusedAppliedSections ?? 13}. Sections Applied to Accused</h3>
                  <div className="space-y-3">
                    {view.section13_accusedAppliedSections.map((entry: any, idx: number) => {
                      const accused = view.section5_accusedDetails?.find((a: any) => a._id === entry.accusedId || a.id === entry.accusedId);
                      return (
                        <div key={idx} className="text-sm p-3 bg-surface-elevated rounded border border-border">
                          <p><span className="font-semibold text-text-secondary">Accused Name:</span> {accused ? accused.name : 'Unknown'}</p>
                          <p><span className="font-semibold text-text-secondary">Sections:</span></p>
                          <ul className="list-disc pl-5">
                            {entry.sections?.map((sec: any, sIdx: number) => (
                              <li key={sIdx}>{sec.code || sec.section_code} - {sec.title || sec.short_title}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section>
                <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.finalReport ?? 14}. Final Report / Prayer</h3>
                <div className="text-sm text-justify text-text-primary whitespace-pre-wrap">{view?.section14_finalReport || 'No final report available.'}</div>
              </section>

              {view?.section15_annexures?.length > 0 && (
                <section>
                  <h3 className="bg-surface-elevated p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-brand-primary mb-3 mt-6 text-text-primary">{sectionNumbers.annexures ?? 15}. Annexures</h3>
                  <div className="space-y-3 text-sm">
                    {view.section15_annexures.map((annex: any, idx: number) => (
                      <div key={idx} className="p-3 bg-surface-elevated rounded border border-border">
                        <p className="font-semibold text-text-primary">{annex.title}</p>
                        <p className="text-xs text-text-secondary mt-1 uppercase tracking-wider">{annex.type}</p>
                        {annex.url ? (
                          <a href={annex.url} target="_blank" rel="noreferrer" className="text-xs text-brand-primary break-all mt-2 inline-block">
                            {annex.url}
                          </a>
                        ) : (
                          <p className="text-xs text-text-muted mt-2">No CDN link available.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : null}
        </div>

        <div className="p-4 border-t border-border bg-surface flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading || regenLoading}>Close</Button>
          <Button
            variant="secondary"
            leftIcon={<RefreshCw size={16} className={regenLoading ? 'animate-spin' : ''} />}
            onClick={handleRegenerate}
            disabled={loading || regenLoading}
            isLoading={regenLoading}
          >
            Regenerate
          </Button>
          <Button
            leftIcon={<Download size={16} />}
            onClick={handleDownload}
            disabled={loading || regenLoading || !data}
          >
            Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
