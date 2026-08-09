'use client';

import React, { useState } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { 
  FileText, Clock, ShieldAlert, AlertTriangle, HelpCircle, 
  CheckCircle2, Send, Loader2, CheckCheck 
} from 'lucide-react';
import apiClient from '@/lib/apiClient';

export interface CaseUnderstandingData {
  case_id: string;
  case_understanding?: {
    executive_summary?: string;
    incident_brief?: string;
    complaint_summary?: string;
    incident_overview?: string;
    crime_category: string;
    crime_subtype: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
  };
  overview?: {
    executive_summary?: string;
    incident_brief?: string;
    complaint_summary?: string;
    incident_overview?: string;
    crime_category: string;
    crime_subtype: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
  };
  timeline: Array<{
    timestamp: string;
    description: string;
    supporting_evidence_ids?: string[];
    confidence?: number;
  }>;
  evidence_intelligence?: Array<{
    evidence_id: string;
    filename: string;
    caption?: string;
    summary: string;
    supports?: string[];
    extracted_information?: string;
    importance: 'low' | 'medium' | 'high' | 'critical';
    confidence?: number;
  }>;
  evidence_analysis?: Array<{
    evidence_id: string;
    filename: string;
    summary: string;
    extracted_information?: string;
    importance: 'low' | 'medium' | 'high' | 'critical';
    allegations_supported?: string[];
    confidence?: number;
  }>;
  missing_information_and_evidence?: Array<{
    title: string;
    description: string;
    importance: 'low' | 'medium' | 'high';
  }>;
  missing_information?: Array<{
    item: string;
    reason: string;
    importance: 'low' | 'medium' | 'high';
  }>;
  missing_evidence?: Array<{
    evidence_name: string;
    reason_relevant: string;
    related_allegation?: string;
    importance: 'low' | 'medium' | 'high';
  }>;
  contradictions: Array<{
    description: string;
    related_evidence_ids?: string[];
    involved_evidence_ids?: string[];
    confidence?: number;
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
  const [previewEvidence, setPreviewEvidence] = useState<{id: string, name: string, summary: string, caption?: string} | null>(null);
  const [requestedItems, setRequestedItems] = useState<Record<string, 'loading' | 'sent'>>({});

  const rawOverview: any = data.case_understanding || data.overview || {};
  const overviewData = {
    executive_summary: rawOverview.executive_summary || rawOverview.complaint_summary || 'No summary available.',
    incident_brief: rawOverview.incident_brief || rawOverview.incident_overview || 'No incident brief available.',
    crime_category: rawOverview.crime_category || 'Uncategorized',
    crime_subtype: rawOverview.crime_subtype || 'General',
    priority: (rawOverview.priority || 'medium') as 'low' | 'medium' | 'high' | 'critical',
    confidence: rawOverview.confidence ?? 0.9,
  };

  const evidenceItems = data.evidence_intelligence || data.evidence_analysis || [];

  const missingItems = data.missing_information_and_evidence || [
    ...(data.missing_information || []).map(m => ({ title: m.item, description: m.reason, importance: m.importance })),
    ...(data.missing_evidence || []).map(m => ({ title: m.evidence_name, description: m.reason_relevant, importance: m.importance }))
  ];

  const handleRequestFromComplainant = async (
    title: string,
    description: string,
    importance: string,
  ) => {
    if (!caseId || requestedItems[title]) return;
    setRequestedItems(prev => ({ ...prev, [title]: 'loading' }));
    try {
      await apiClient.post(`/cases/${caseId}/citizen-request/missing-info`, {
        item: title,
        reason: description,
        importance,
        type: 'missing_information_and_evidence',
      });
      setRequestedItems(prev => ({ ...prev, [title]: 'sent' }));
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to send request to complainant');
      setRequestedItems(prev => { const n = { ...prev }; delete n[title]; return n; });
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'critical':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-red-900/30 text-red-400 border border-red-700 uppercase">Critical Priority</span>;
      case 'high':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-orange-900/30 text-orange-400 border border-orange-700 uppercase">High Priority</span>;
      case 'medium':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-700 uppercase">Medium Priority</span>;
      default:
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-blue-900/30 text-blue-400 border border-blue-700 uppercase">Low Priority</span>;
    }
  };

  const tabs = [
    { id: 'overview', label: '1. Case Understanding', icon: FileText },
    { id: 'timeline', label: '2. Timeline', icon: Clock },
    { id: 'evidence', label: '3. Evidence Intelligence', icon: CheckCircle2 },
    { id: 'missing_info', label: '4. Missing Info & Evidence', icon: HelpCircle },
    { id: 'contradictions', label: '5. Contradictions', icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight">Case Understanding Intelligence</h2>
            {getPriorityBadge(overviewData.priority)}
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Category: <strong className="text-white">{overviewData.crime_category}</strong> ({overviewData.crime_subtype})
            • Confidence: <strong className="text-emerald-400">{(overviewData.confidence * 100).toFixed(0)}%</strong>
          </p>
        </div>
        {data.processing_duration_ms && (
          <div className="text-xs bg-slate-800 px-3 py-1.5 rounded-lg text-slate-300 border border-slate-700">
            Single-Pass LLM Latency: <strong>{(data.processing_duration_ms / 1000).toFixed(2)}s</strong>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-800 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                isActive 
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-600/40 shadow-sm' 
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white border border-neutral-700'
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
        {/* 1. CASE UNDERSTANDING */}
        {activeTab === 'overview' && (
          <Card className="space-y-4 p-6">
            <CardHeader title="1. Case Understanding Overview" />
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Executive Summary</h4>
                <p className="text-sm font-semibold text-text-primary mt-1">{overviewData.executive_summary}</p>
              </div>
              <div className="border-t border-neutral-800 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Incident Brief</h4>
                <p className="text-sm text-text-secondary mt-1 leading-relaxed whitespace-pre-line">{overviewData.incident_brief}</p>
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
                  <div key={idx} className="flex gap-4 items-start border-l-2 border-indigo-700 pl-4 py-1">
                    <div className="space-y-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-900/30 text-indigo-300 border border-indigo-800">
                        {event.timestamp}
                      </span>
                      <p className="text-sm text-text-primary font-medium mt-1">{event.description}</p>
                      {event.supporting_evidence_ids && event.supporting_evidence_ids.length > 0 && (
                        <p className="text-xs text-neutral-500">
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

        {/* 3. EVIDENCE INTELLIGENCE */}
        {activeTab === 'evidence' && (
          <Card className="p-6">
            <CardHeader title="3. Evidence Intelligence" />
            <div className="mt-4 space-y-4">
              {(evidenceItems.length === 0) ? (
                <p className="text-sm text-neutral-500 italic">No evidence items uploaded or analyzed.</p>
              ) : (
                (() => {
                  const seenKeys = new Set<string>();
                  const uniqueItems = evidenceItems.filter((ev) => {
                    const key = ev.filename || ev.evidence_id;
                    if (key && seenKeys.has(key)) return false;
                    if (key) seenKeys.add(key);
                    return true;
                  });

                  return uniqueItems.map((ev, idx) => {
                    const evItem = ev as any;
                    const captionText = evItem.caption || evItem.filename || `Evidence Item ${idx+1}`;
                    const summaryText = (evItem.summary || '').trim();
                    const supports: string[] = evItem.supports || evItem.allegations_supported || [];

                    return (
                      <div 
                        key={ev.evidence_id || idx} 
                        className="p-4 border border-neutral-800 rounded-lg space-y-3 bg-neutral-900/50 hover:bg-neutral-800/70 cursor-pointer transition-colors"
                        onClick={() => setPreviewEvidence({ 
                          id: ev.evidence_id, 
                          name: ev.filename,
                          summary: summaryText,
                          caption: captionText
                        })}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm text-text-primary">{captionText}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-700 text-neutral-300 uppercase border border-neutral-600">{ev.importance || 'medium'}</span>
                        </div>
                        {summaryText && <p className="text-xs text-text-secondary leading-relaxed">{summaryText}</p>}
                        {supports.length > 0 && (
                          <div className="pt-2 border-t border-neutral-800">
                            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Supports Allegations:</span>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {supports.map((alg: string, aIdx: number) => (
                                <span key={aIdx} className="px-2 py-0.5 text-[11px] bg-emerald-900/30 text-emerald-400 border border-emerald-800 rounded font-medium">
                                  {alg}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </Card>
        )}

        {/* 4. MISSING INFORMATION & EVIDENCE */}
        {activeTab === 'missing_info' && (
          <Card className="p-6">
            <CardHeader title="4. Missing Information & Evidence (Complainant Clarifications)" />
            <div className="mt-4 space-y-3">
              {(missingItems.length === 0) ? (
                <p className="text-sm text-emerald-400 bg-emerald-900/20 p-3 rounded-lg border border-emerald-800">
                  No missing information or evidence items flagged.
                </p>
              ) : (
                missingItems.map((item, i) => (
                  <div key={i} className="p-3.5 border border-amber-800/50 bg-amber-900/20 rounded-lg text-xs space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-amber-300 text-sm">{item.title}</span>
                      <span className="uppercase text-[10px] font-bold bg-amber-900/40 text-amber-400 border border-amber-700 px-2 py-0.5 rounded shrink-0">{item.importance}</span>
                    </div>
                    <p className="text-amber-200/80 leading-relaxed">{item.description}</p>
                    {caseId && (
                      <div className="pt-1">
                        <button
                          onClick={() => handleRequestFromComplainant(item.title, item.description, item.importance)}
                          disabled={!!requestedItems[item.title]}
                          className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md transition-all ${
                            requestedItems[item.title] === 'sent'
                              ? 'bg-green-900/30 text-green-400 border border-green-700 cursor-default'
                              : requestedItems[item.title] === 'loading'
                              ? 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                              : 'bg-neutral-800 text-neutral-200 border border-neutral-600 hover:bg-neutral-700 cursor-pointer'
                          }`}
                        >
                          {requestedItems[item.title] === 'sent' ? (
                            <><CheckCheck size={12} /> Requested from Complainant</>
                          ) : requestedItems[item.title] === 'loading' ? (
                            <><Loader2 size={12} className="animate-spin" /> Sending...</>
                          ) : (
                            <><Send size={12} /> Request from Complainant</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* 5. CONTRADICTIONS */}
        {activeTab === 'contradictions' && (
          <Card className="p-6">
            <CardHeader title="5. Contradictions & Discrepancies" />
            <div className="mt-4 space-y-3">
              {(!data.contradictions || data.contradictions.length === 0) ? (
                <p className="text-sm text-emerald-400 bg-emerald-900/20 p-3 rounded-lg border border-emerald-800 font-medium">
                  No contradictions or conflicts detected across complaint and evidence.
                </p>
              ) : (
                data.contradictions.map((c, i) => {
                  const evIds = c.related_evidence_ids || c.involved_evidence_ids || [];
                  return (
                    <div key={i} className="p-3 border border-red-800/50 bg-red-900/20 rounded-lg text-xs text-red-300 font-medium space-y-1">
                      <p>• {c.description}</p>
                      {evIds.length > 0 && (
                        <p className="text-[11px] text-red-400">Involved Evidence IDs: {evIds.join(', ')}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        )}

        {/* 6. ORIGINAL COMPLAINT */}
        {activeTab === 'complaint' && (
          <Card className="p-6">
            <CardHeader title="6. Original Complaint Text" />
            <div className="mt-4 p-4 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono text-text-secondary whitespace-pre-wrap leading-relaxed">
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

            <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-400 mb-1">Evidence Title / Caption</h3>
                <p className="text-sm font-semibold text-text-primary">{previewEvidence.caption || previewEvidence.name}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-bold text-neutral-400 mb-1">AI Summary &amp; Contribution</h3>
                <div className="p-3 bg-neutral-800 border border-neutral-700 rounded text-xs text-text-secondary leading-relaxed">
                  {previewEvidence.summary || 'No summary available.'}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
