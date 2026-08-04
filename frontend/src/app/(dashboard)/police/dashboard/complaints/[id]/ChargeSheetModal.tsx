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
  const [loading, setLoading] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [error, setError] = useState('');

  const sectionNumbers = useMemo(() => {
    const numbers: Record<string, number | null> = {};
    let counter = 0;

    const addSection = (visible: boolean, key: string) => {
      if (!visible) return;
      counter += 1;
      numbers[key] = counter;
    };

    addSection(true, 'filingInformation');
    addSection(true, 'caseParticulars');
    addSection(Boolean(data?.section3_complainantDetails), 'complainantDetails');
    addSection(Boolean(data?.section4_victimDetails?.length), 'victimDetails');
    addSection(Boolean(data?.section5_accusedDetails?.length), 'accusedDetails');
    addSection(Boolean(data?.section6_applicableLegalSections?.length), 'applicableLegalSections');
    addSection(Boolean(data?.section7_evidenceLinkedSections?.length), 'evidenceLinkedSections');
    addSection(true, 'investigationSummary');
    addSection(Boolean(data?.section9_witnesses?.length), 'witnesses');
    addSection(Boolean(data?.section10_evidenceCollected?.length), 'evidenceCollected');
    addSection(Boolean(data?.section11_departmentReports?.length), 'departmentReports');
    addSection(true, 'investigationFindings');
    addSection(Boolean(data?.section13_accusedAppliedSections?.length), 'accusedAppliedSections');
    addSection(true, 'finalReport');
    addSection(Boolean(data?.section15_annexures?.length), 'annexures');

    return numbers;
  }, [data]);

  const fetchChargeSheet = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get(`/cases/${caseId}/chargesheet`);
      setData(res.data.data);
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

  const handleDownload = () => {
    const downloadPdf = async () => {
      setError('');
      setRegenLoading(true);
      try {
        const res = await apiClient.get(`/cases/${caseId}/chargesheet/pdf`, {
          responseType: 'blob',
        });
        const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `ChargeSheet_${data?.section1_filingInformation?.firNumber || 'Draft'}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to download charge sheet PDF.');
      } finally {
        setRegenLoading(false);
      }
    };

    void downloadPdf();
  };

  useEffect(() => {
    if (isOpen) {
      fetchChargeSheet();
    }
  }, [isOpen, caseId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-neutral-50">
          <div className="flex items-center gap-2 text-neutral-800">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold">Final Report / Charge Sheet</h2>
            {data?.section1_filingInformation?.version && (
              <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full font-medium">
                v{data.section1_filingInformation.version}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-neutral-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-neutral-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-neutral-500 font-medium text-sm">Loading Charge Sheet...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200 text-center">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-6 max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-neutral-200 text-neutral-800">
              
              <div className="text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-black uppercase text-neutral-900 tracking-wider">FINAL REPORT</h1>
                <p className="text-sm font-medium text-neutral-500 mt-1 uppercase tracking-widest">Under Section 173 CrPC</p>
              </div>

              {/* 1. Filing Information */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3">{sectionNumbers.filingInformation ?? 1}. Filing Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-semibold text-neutral-500">Charge Sheet No:</span> {data.section1_filingInformation.chargeSheetNumber}</div>
                  <div><span className="font-semibold text-neutral-500">FIR No:</span> {data.section1_filingInformation.firNumber}</div>
                  <div><span className="font-semibold text-neutral-500">Police Station:</span> {data.section1_filingInformation.policeStation}</div>
                  <div><span className="font-semibold text-neutral-500">Filing Date:</span> {data.section1_filingInformation.filingDate ? new Date(data.section1_filingInformation.filingDate).toLocaleDateString() : 'N/A'}</div>
                </div>
              </section>

              {/* 2. Case Particulars */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.caseParticulars ?? 2}. Case Particulars</h3>
                <div className="text-sm space-y-2">
                  <p><span className="font-semibold text-neutral-500">Nature of Offence:</span> {data.section2_caseParticulars.natureOfOffence}</p>
                  <p><span className="font-semibold text-neutral-500">Date/Time:</span> {data.section2_caseParticulars.dateOfOccurrence ? new Date(data.section2_caseParticulars.dateOfOccurrence).toLocaleDateString() : ''} {data.section2_caseParticulars.timeOfOccurrence}</p>
                  <p><span className="font-semibold text-neutral-500">Place:</span> {data.section2_caseParticulars.placeOfOccurrence}</p>
                  <div>
                    <span className="font-semibold text-neutral-500">Brief Description:</span>
                    <p className="mt-1 text-justify text-neutral-700 bg-neutral-50 p-3 rounded">{data.section2_caseParticulars.briefCaseDescription}</p>
                  </div>
                </div>
              </section>
              {/* 3. Complainant Details */}
              {data.section3_complainantDetails && (
                <section>
                  <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.complainantDetails ?? 3}. Complainant / Informant Details</h3>
                  <div className="text-sm space-y-1">
                    <p><span className="font-semibold text-neutral-500">Name:</span> {data.section3_complainantDetails.firstName} {data.section3_complainantDetails.lastName}</p>
                    <p><span className="font-semibold text-neutral-500">Contact:</span> {data.section3_complainantDetails.phone} | {data.section3_complainantDetails.email}</p>
                    <p><span className="font-semibold text-neutral-500">Address:</span> {data.section3_complainantDetails.address}</p>
                  </div>
                </section>
              )}

              {/* 4. Victim Details */}
              {data.section4_victimDetails?.length > 0 && (
                <section>
                  <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.victimDetails ?? 4}. Victim Details</h3>
                  <div className="space-y-3">
                    {data.section4_victimDetails.map((victim: any, idx: number) => (
                      <div key={idx} className="text-sm p-3 bg-neutral-50 rounded border">
                        <p><span className="font-semibold text-neutral-500">Name:</span> {victim.name}</p>
                        <p><span className="font-semibold text-neutral-500">Contact:</span> {victim.contact?.phone} | {victim.contact?.email}</p>
                        <p><span className="font-semibold text-neutral-500">Address:</span> {victim.contact?.address}</p>
                        {victim.victimProfile?.injuryDetails && <p><span className="font-semibold text-neutral-500">Injuries:</span> {victim.victimProfile.injuryDetails}</p>}
                        {victim.victimProfile?.lossDetails && <p><span className="font-semibold text-neutral-500">Loss:</span> {victim.victimProfile.lossDetails}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 5. Accused Details */}
              {data.section5_accusedDetails?.length > 0 && (
                <section>
                  <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.accusedDetails ?? 5}. Accused Details</h3>
                  <div className="space-y-3">
                    {data.section5_accusedDetails.map((accused: any, idx: number) => (
                      <div key={idx} className="text-sm p-3 bg-neutral-50 rounded border">
                        <p><span className="font-semibold text-neutral-500">Name:</span> {accused.name}</p>
                        <p><span className="font-semibold text-neutral-500">Contact:</span> {accused.contact?.phone} | {accused.contact?.address}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 6. Applicable Legal Sections */}
              {data.section6_applicableLegalSections?.length > 0 && (
                <section>
                  <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.applicableLegalSections ?? 6}. Applicable Legal Sections</h3>
                  <div className="text-sm">
                    <ul className="list-disc pl-5 space-y-1">
                      {data.section6_applicableLegalSections.map((sec: any, idx: number) => (
                        <li key={idx}><span className="font-semibold">{sec.code || sec.section_code}</span> - {sec.title || sec.short_title}</li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}

              {/* 7. Evidence-linked sections */}
              {data.section7_evidenceLinkedSections?.length > 0 && (
                <section>
                  <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.evidenceLinkedSections ?? 7}. Evidence-linked BSA Sections</h3>
                  <div className="space-y-3">
                    {data.section7_evidenceLinkedSections.map((entry: any, idx: number) => (
                      <div key={idx} className="text-sm p-3 bg-neutral-50 rounded border">
                        <p className="font-semibold text-neutral-800">{entry.title || entry.evidence_id || 'Evidence'}</p>
                        {entry.applicable_sections?.length > 0 ? (
                          <ul className="list-disc pl-5 mt-2 space-y-1">
                            {entry.applicable_sections.map((sec: any, sIdx: number) => (
                              <li key={sIdx}><span className="font-semibold">{sec.code}</span> - {sec.title}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-neutral-500 mt-2 text-xs">No linked statutory sections yet.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 8. Investigation Summary */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.investigationSummary ?? 8}. Investigation Summary</h3>
                <div className="text-sm text-justify text-neutral-700 whitespace-pre-wrap">{data.section8_investigationSummary || 'No summary available.'}</div>
              </section>

              {/* 9. Witnesses */}
              {data.section9_witnesses?.length > 0 && (
                <section>
                  <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.witnesses ?? 9}. Witnesses</h3>
                  <div className="space-y-3">
                    {data.section9_witnesses.map((witness: any, idx: number) => (
                      <div key={idx} className="text-sm p-3 bg-neutral-50 rounded border">
                        <p><span className="font-semibold text-neutral-500">Name:</span> {witness.name}</p>
                        <p><span className="font-semibold text-neutral-500">Contact:</span> {witness.contact?.phone} | {witness.contact?.address}</p>
                        {witness.witnessProfile?.statement && <p className="mt-1"><span className="font-semibold text-neutral-500">Statement:</span> <span className="italic">{witness.witnessProfile.statement}</span></p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 10. Evidence Collected */}
              {data.section10_evidenceCollected?.length > 0 && (
                <section>
                  <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.evidenceCollected ?? 10}. Evidence Collected</h3>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {data.section10_evidenceCollected.map((ev: any, idx: number) => (
                      <li key={idx}><span className="font-semibold">{ev.title || ev.evidence_id || ev.type}:</span> {ev.description || ev.ai_description || ev.storage_ref}</li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 11. Department & Forensic Reports */}
              {data.section11_departmentReports?.length > 0 && (
                <section>
                  <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.departmentReports ?? 11}. Department Reports</h3>
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {data.section11_departmentReports.map((req: any, idx: number) => (
                      <li key={idx}><span className="font-semibold">{req.department}:</span> {req.request_type} - <span className="uppercase text-xs">{req.status}</span></li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 12. Investigation Findings */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.investigationFindings ?? 12}. Investigation Findings</h3>
                <div className="text-sm text-justify text-neutral-700 whitespace-pre-wrap">{data.section12_investigationFindings || 'No findings available.'}</div>
              </section>

              {/* 13. Accused Applied Sections */}
              {data.section13_accusedAppliedSections?.length > 0 && (
                <section>
                  <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.accusedAppliedSections ?? 13}. Sections Applied to Accused</h3>
                  <div className="space-y-3">
                    {data.section13_accusedAppliedSections.map((entry: any, idx: number) => {
                      const accused = data.section5_accusedDetails?.find((a: any) => a._id === entry.accusedId || a.id === entry.accusedId);
                      return (
                        <div key={idx} className="text-sm p-3 bg-neutral-50 rounded border">
                          <p><span className="font-semibold text-neutral-500">Accused Name:</span> {accused ? accused.name : 'Unknown'}</p>
                          <p><span className="font-semibold text-neutral-500">Sections:</span></p>
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

              {/* 14. Final Report / Prayer */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.finalReport ?? 14}. Final Report / Prayer</h3>
                <div className="text-sm text-justify text-neutral-700 whitespace-pre-wrap">{data.section14_finalReport || 'No final report available.'}</div>
              </section>

              {data.section15_annexures?.length > 0 && (
                <section>
                  <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">{sectionNumbers.annexures ?? 15}. Annexures</h3>
                  <div className="space-y-3 text-sm">
                    {data.section15_annexures.map((annex: any, idx: number) => (
                      <div key={idx} className="p-3 bg-neutral-50 rounded border">
                        <p className="font-semibold text-neutral-800">{annex.title}</p>
                        <p className="text-xs text-neutral-500 mt-1 uppercase tracking-wider">{annex.type}</p>
                        {annex.url ? (
                          <a href={annex.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 break-all mt-2 inline-block">
                            {annex.url}
                          </a>
                        ) : (
                          <p className="text-xs text-neutral-400 mt-2">No CDN link available.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

            </div>
          ) : null}
        </div>

        <div className="p-4 border-t bg-white flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading || regenLoading}>Close</Button>
          <Button
            variant="secondary"
            leftIcon={<RefreshCw size={16} className={regenLoading ? "animate-spin" : ""} />}
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
