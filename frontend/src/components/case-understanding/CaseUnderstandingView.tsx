'use client';

import React, { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { 
  FileText, Clock, Users, ShieldAlert, GitCompare, 
  AlertTriangle, HelpCircle, FileQuestion, CheckCircle2, 
  Building2, MapPin, Phone, Mail, CreditCard, DollarSign, Smartphone, Send, Loader2, CheckCheck
} from 'lucide-react';
import apiClient from '@/lib/apiClient';

export interface CaseUnderstandingData {
  case_id: string;
  overview: {
    complaint_summary: string;
    incident_overview: string;
    crime_category: string;
    crime_subtype: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
  };
  timeline: Array<{
    timestamp: string;
    description: string;
    supporting_evidence_ids: string[];
    confidence: number;
  }>;
  people_and_entities: {
    victims: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    suspects: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    witnesses: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    other_persons: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    organizations: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    locations: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    vehicles: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    phone_numbers: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    emails: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    upi_ids: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    bank_accounts: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    documents: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    money: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    digital_assets: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
    physical_assets: Array<{ value: string; source_evidence_ids: string[]; confidence: number }>;
  };
  evidence_analysis: Array<{
    evidence_id: string;
    filename: string;
    summary: string;
    extracted_information: string;
    importance: 'low' | 'medium' | 'high' | 'critical';
    allegations_supported: string[];
    confidence: number;
  }>;
  evidence_correlation: Array<{
    allegation: string;
    supporting_evidence_ids: string[];
    confidence: number;
    contradicts_claim: boolean;
    explanation?: string;
  }>;
  crime_analysis: {
    crime_category: string;
    crime_subtype: string;
    modus_operandi: string;
    estimated_financial_loss?: number;
    digital_assets_involved: string[];
    physical_assets_involved: string[];
  };
  contradictions: Array<{
    description: string;
    involved_evidence_ids: string[];
    confidence: number;
  }>;
  missing_information: Array<{
    item: string;
    reason: string;
    importance: 'low' | 'medium' | 'high';
  }>;
  missing_evidence: Array<{
    evidence_name: string;
    reason_relevant: string;
    related_allegation: string;
    importance: 'low' | 'medium' | 'high';
  }>;
  original_complaint?: string;
  processing_duration_ms?: number;
  created_at?: string;
}

interface Props {
  data: CaseUnderstandingData;
  caseId?: string;
}

export function CaseUnderstandingView({ data, caseId }: Props): React.ReactElement {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [previewEvidence, setPreviewEvidence] = useState<{id: string, name: string, summary: string, extracted_information: string} | null>(null);
  // Track which missing items have been requested (key = item string)
  const [requestedItems, setRequestedItems] = useState<Record<string, 'loading' | 'sent'>>({});

  const handleRequestFromComplainant = async (
    item: string,
    reason: string,
    importance: string,
    type: 'missing_information' | 'missing_evidence',
  ) => {
    if (!caseId || requestedItems[item]) return;
    setRequestedItems(prev => ({ ...prev, [item]: 'loading' }));
    try {
      await apiClient.post(`/cases/${caseId}/citizen-request/missing-info`, {
        item,
        reason,
        importance,
        type,
      });
      setRequestedItems(prev => ({ ...prev, [item]: 'sent' }));
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to send request to complainant');
      setRequestedItems(prev => { const n = { ...prev }; delete n[item]; return n; });
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800 border border-red-300 uppercase">Critical Priority</span>;
      case 'high':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-orange-100 text-orange-800 border border-orange-300 uppercase">High Priority</span>;
      case 'medium':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300 uppercase">Medium Priority</span>;
      default:
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-300 uppercase">Low Priority</span>;
    }
  };

  const tabs = [
    { id: 'overview', label: '1. Overview', icon: FileText },
    { id: 'timeline', label: '2. Timeline', icon: Clock },
    { id: 'entities', label: '3. People & Entities', icon: Users },
    { id: 'evidence', label: '4. Evidence Analysis', icon: CheckCircle2 },
    { id: 'correlation', label: '5. Evidence Correlation', icon: GitCompare },
    { id: 'crime', label: '6. Crime Analysis', icon: ShieldAlert },
    { id: 'contradictions', label: '7. Contradictions', icon: AlertTriangle },
    { id: 'missing_info', label: '8. Missing Info', icon: HelpCircle },
    { id: 'missing_evidence', label: '9. Missing Evidence', icon: FileQuestion },
    { id: 'complaint', label: '10. Original Complaint', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight">Case Understanding Intelligence</h2>
            {getPriorityBadge(data.overview.priority)}
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Category: <strong className="text-white">{data.overview.crime_category}</strong> ({data.overview.crime_subtype})
            • Confidence: <strong className="text-emerald-400">{(data.overview.confidence * 100).toFixed(0)}%</strong>
          </p>
        </div>
        {data.processing_duration_ms && (
          <div className="text-xs bg-slate-800 px-3 py-1.5 rounded-lg text-slate-300 border border-slate-700">
            Single-Pass LLM Latency: <strong>{(data.processing_duration_ms / 1000).toFixed(2)}s</strong>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                isActive 
                  ? 'bg-slate-900 text-white shadow-sm' 
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* 1. OVERVIEW */}
        {activeTab === 'overview' && (
          <Card className="space-y-4 p-6">
            <CardHeader title="1. Incident & Complaint Overview" />
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Complaint Summary</h4>
                <p className="text-sm font-semibold text-neutral-900 mt-1">{data.overview.complaint_summary}</p>
              </div>
              <div className="border-t border-neutral-100 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Integrated Incident Overview</h4>
                <p className="text-sm text-neutral-700 mt-1 leading-relaxed whitespace-pre-line">{data.overview.incident_overview}</p>
              </div>
            </div>
          </Card>
        )}

        {/* 2. TIMELINE */}
        {activeTab === 'timeline' && (
          <Card className="p-6">
            <CardHeader title="2. Chronological Case Timeline" />
            <div className="mt-4 space-y-4">
              {(!data.timeline || data.timeline.length === 0) ? (
                <p className="text-sm text-neutral-500 italic">No timeline events extracted.</p>
              ) : (
                data.timeline.map((event, idx) => (
                  <div key={idx} className="flex gap-4 items-start border-l-2 border-slate-900 pl-4 py-1">
                    <div className="space-y-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                        {event.timestamp}
                      </span>
                      <p className="text-sm text-neutral-800 font-medium mt-1">{event.description}</p>
                      {event.supporting_evidence_ids && event.supporting_evidence_ids.length > 0 && (
                        <p className="text-xs text-neutral-400">
                          Evidence Ref: {event.supporting_evidence_ids.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* 3. PEOPLE & ENTITIES */}
        {activeTab === 'entities' && (
          <Card className="p-6 space-y-6">
            <CardHeader title="3. Extracted People & Entities" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-red-600 flex items-center gap-2">
                  <Users size={14} /> Suspects ({(data.people_and_entities?.suspects || []).length})
                </h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(data.people_and_entities?.suspects || []).map((s, i) => (
                    <span key={i} className="px-2.5 py-1 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-md">
                      {s.value}
                    </span>
                  ))}
                  {(!data.people_and_entities?.suspects || data.people_and_entities.suspects.length === 0) && <span className="text-xs text-neutral-400 italic">None</span>}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-2">
                  <Users size={14} /> Victims ({(data.people_and_entities?.victims || []).length})
                </h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(data.people_and_entities?.victims || []).map((v, i) => (
                    <span key={i} className="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-md">
                      {v.value}
                    </span>
                  ))}
                  {(!data.people_and_entities?.victims || data.people_and_entities.victims.length === 0) && <span className="text-xs text-neutral-400 italic">None</span>}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Phone size={14} /> Phone Numbers
                </h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(data.people_and_entities?.phone_numbers || []).map((p, i) => (
                    <span key={i} className="px-2.5 py-1 text-xs font-mono bg-slate-100 text-slate-800 rounded-md">
                      {p.value}
                    </span>
                  ))}
                  {(!data.people_and_entities?.phone_numbers || data.people_and_entities.phone_numbers.length === 0) && <span className="text-xs text-neutral-400 italic">None</span>}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <CreditCard size={14} /> Bank Accounts & UPI IDs
                </h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(data.people_and_entities?.upi_ids || []).map((u, i) => (
                    <span key={i} className="px-2.5 py-1 text-xs font-mono bg-purple-50 text-purple-700 border border-purple-200 rounded-md">
                      UPI: {u.value}
                    </span>
                  ))}
                  {(data.people_and_entities?.bank_accounts || []).map((b, i) => (
                    <span key={i} className="px-2.5 py-1 text-xs font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                      {b.value}
                    </span>
                  ))}
                  {(!data.people_and_entities?.upi_ids?.length && !data.people_and_entities?.bank_accounts?.length) && <span className="text-xs text-neutral-400 italic">None</span>}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* 4. EVIDENCE ANALYSIS */}
        {activeTab === 'evidence' && (
          <Card className="p-6">
            <CardHeader title="4. Individual Evidence Analysis" />
            <div className="mt-4 space-y-4">
              {(!data.evidence_analysis || data.evidence_analysis.length === 0) ? (
                <p className="text-sm text-neutral-500 italic">No individual evidence items analyzed.</p>
              ) : (
                (() => {
                  // Deduplicate evidence analysis items by filename or evidence_id
                  const seenKeys = new Set<string>();
                  const uniqueItems = data.evidence_analysis.filter((ev) => {
                    const key = ev.filename || ev.evidence_id;
                    if (key && seenKeys.has(key)) return false;
                    if (key) seenKeys.add(key);
                    return true;
                  });

                  return uniqueItems.map((ev, idx) => {
                    const summaryClean = (ev.summary || '').trim();
                    const infoClean = (ev.extracted_information || '').trim();
                    const isDuplicateText = infoClean && (
                      infoClean === summaryClean ||
                      summaryClean.includes(infoClean) ||
                      infoClean.includes(summaryClean)
                    );

                    return (
                      <div 
                        key={ev.evidence_id || idx} 
                        className="p-4 border border-neutral-200 rounded-lg space-y-2 bg-neutral-50/50 hover:bg-neutral-100 cursor-pointer transition-colors"
                        onClick={() => setPreviewEvidence({ 
                          id: ev.evidence_id, 
                          name: ev.filename,
                          summary: ev.summary,
                          extracted_information: ev.extracted_information
                        })}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm text-slate-900">{ev.filename}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-800 uppercase">{ev.importance}</span>
                        </div>
                        {summaryClean && <p className="text-xs font-semibold text-slate-700">{summaryClean}</p>}
                        {!isDuplicateText && infoClean && (
                          <p className="text-xs text-neutral-600">{infoClean}</p>
                        )}
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </Card>
        )}

        {/* 5. EVIDENCE CORRELATION */}
        {activeTab === 'correlation' && (
          <Card className="p-6">
            <CardHeader title="5. Evidence Correlation & Corroboration" />
            <div className="mt-4 space-y-4">
              {(!data.evidence_correlation || data.evidence_correlation.length === 0) ? (
                <p className="text-sm text-neutral-500 italic">No evidence correlations found.</p>
              ) : (
                data.evidence_correlation.map((corr, idx) => (
                  <div key={idx} className={`p-4 border rounded-lg space-y-2 ${corr.contradicts_claim ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-neutral-900">Allegation: "{corr.allegation}"</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-white shadow-xs">
                        {(corr.confidence * 100).toFixed(0)}% Confidence
                      </span>
                    </div>
                    <p className="text-xs text-neutral-700">{corr.explanation}</p>
                    {corr.supporting_evidence_ids && (
                      <p className="text-xs text-neutral-500">Supporting Evidence IDs: {corr.supporting_evidence_ids.join(', ')}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* 6. CRIME ANALYSIS */}
        {activeTab === 'crime' && (
          <Card className="p-6 space-y-4">
            <CardHeader title="6. Crime Analysis & Modus Operandi" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-bold text-neutral-400 uppercase">Modus Operandi</p>
                <p className="text-sm font-medium text-neutral-800 mt-1 leading-relaxed">{data.crime_analysis?.modus_operandi || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-400 uppercase">Estimated Financial Loss</p>
                <p className="text-xl font-bold text-emerald-600 mt-1">
                  {data.crime_analysis?.estimated_financial_loss != null 
                    ? `₹${data.crime_analysis.estimated_financial_loss.toLocaleString('en-IN')}` 
                    : 'N/A'}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* 7. CONTRADICTIONS */}
        {activeTab === 'contradictions' && (
          <Card className="p-6">
            <CardHeader title="7. Contradictions & Discrepancies" />
            <div className="mt-4 space-y-3">
              {(!data.contradictions || data.contradictions.length === 0) ? (
                <p className="text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                  No contradictions or conflicts detected across complaint and evidence.
                </p>
              ) : (
                data.contradictions.map((c, i) => (
                  <div key={i} className="p-3 border border-red-200 bg-red-50 rounded-lg text-xs text-red-900 font-medium">
                    • {c.description} (Evidence: {c.involved_evidence_ids?.join(', ') || 'N/A'})
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* 8. MISSING INFORMATION */}
        {activeTab === 'missing_info' && (
          <Card className="p-6">
            <CardHeader title="8. Missing Complaint Information" />
            <div className="mt-4 space-y-3">
              {(!data.missing_information || data.missing_information.length === 0) ? (
                <p className="text-sm text-neutral-500 italic">No missing information flags recorded.</p>
              ) : (
                data.missing_information.map((mi, i) => (
                  <div key={i} className="p-3 border border-amber-200 bg-amber-50 rounded-lg text-xs space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-amber-900">{mi.item}</span>
                      <span className="uppercase text-[10px] bg-amber-200 px-1.5 py-0.5 rounded shrink-0">{mi.importance}</span>
                    </div>
                    <p className="text-amber-800">{mi.reason}</p>

                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* 9. MISSING EVIDENCE */}
        {activeTab === 'missing_evidence' && (
          <Card className="p-6">
            <CardHeader title="9. Recommended Corroborating Evidence Gaps" />
            <div className="mt-4 space-y-3">
              {(!data.missing_evidence || data.missing_evidence.length === 0) ? (
                <p className="text-sm text-neutral-500 italic">No missing evidence recommendations recorded.</p>
              ) : (
                data.missing_evidence.map((me, i) => (
                  <div key={i} className="p-3 border border-slate-200 bg-slate-50 rounded-lg text-xs space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-slate-900">{me.evidence_name}</span>
                      <span className="uppercase text-[10px] bg-slate-200 px-1.5 py-0.5 rounded shrink-0">{me.importance}</span>
                    </div>
                    <p className="text-slate-700">{me.reason_relevant}</p>
                    <p className="text-slate-500 italic">Allegation: {me.related_allegation}</p>
                    {caseId && (
                      <button
                        onClick={() => handleRequestFromComplainant(me.evidence_name, me.reason_relevant, me.importance, 'missing_evidence')}
                        disabled={!!requestedItems[me.evidence_name]}
                        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all ${
                          requestedItems[me.evidence_name] === 'sent'
                            ? 'bg-green-100 text-green-700 border border-green-200 cursor-default'
                            : requestedItems[me.evidence_name] === 'loading'
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 cursor-pointer'
                        }`}
                      >
                        {requestedItems[me.evidence_name] === 'sent' ? (
                          <><CheckCheck size={12} /> Requested</>
                        ) : requestedItems[me.evidence_name] === 'loading' ? (
                          <><Loader2 size={12} className="animate-spin" /> Sending...</>
                        ) : (
                          <><Send size={12} /> Request from Complainant</>
                        )}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* 10. ORIGINAL COMPLAINT */}
        {activeTab === 'complaint' && (
          <Card className="p-6">
            <CardHeader title="10. Original Complaint Text" />
            <div className="mt-4 p-4 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-mono text-neutral-800 whitespace-pre-wrap leading-relaxed">
              {data.original_complaint || 'No complaint text available.'}
            </div>
          </Card>
        )}
      </div>

      <Modal
        isOpen={previewEvidence !== null}
        onClose={() => setPreviewEvidence(null)}
        title={`Evidence Preview: ${previewEvidence?.name}`}
        size="lg"
      >
        {previewEvidence && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-center items-center p-4 bg-neutral-900 rounded-lg overflow-hidden min-h-[300px]">
              {previewEvidence.name.match(/\.(mp4|mov|webm)$/i) ? (
                <video 
                  src={`https://res.cloudinary.com/q9ixw3zp/video/upload/${previewEvidence.id}`} 
                  controls 
                  className="max-w-full max-h-[50vh] object-contain"
                />
              ) : previewEvidence.name.match(/\.(mp3|wav|ogg)$/i) ? (
                <audio 
                  src={`https://res.cloudinary.com/q9ixw3zp/video/upload/${previewEvidence.id}`} 
                  controls 
                  className="w-full"
                />
              ) : (
                <img 
                  src={`https://res.cloudinary.com/q9ixw3zp/image/upload/${previewEvidence.id}`} 
                  alt={previewEvidence.name}
                  className="max-w-full max-h-[50vh] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-white text-sm">Preview not available for this file type.</p>';
                  }}
                />
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">AI Summary & Visual Tags</h3>
                <p className="text-sm text-slate-600">{previewEvidence.summary || 'No visual summary available.'}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">Extracted Content (OCR)</h3>
                <div className="p-3 bg-white border border-slate-200 rounded text-xs text-slate-600 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {previewEvidence.extracted_information || 'No text extracted from this media.'}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
