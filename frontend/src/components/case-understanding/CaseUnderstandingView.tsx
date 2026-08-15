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
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-semantic-critical/10 text-semantic-critical border border-semantic-critical/30 uppercase">Critical Priority</span>;
      case 'high':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-semantic-warning/10 text-semantic-warning border border-semantic-warning/30 uppercase">High Priority</span>;
      case 'medium':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 uppercase">Medium Priority</span>;
      default:
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-surface-elevated text-text-secondary border border-border uppercase">Low Priority</span>;
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
      <div className="bg-surface border border-border text-text-primary rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-text-primary">Case Understanding Intelligence</h2>
            {getPriorityBadge(overviewData.priority)}
          </div>
          <p className="text-text-secondary text-sm mt-1">
            Category: <strong className="text-brand-primary font-mono uppercase">{overviewData.crime_category}</strong> ({overviewData.crime_subtype})
            &bull; Confidence: <strong className="text-semantic-success font-bold">{(overviewData.confidence * 100).toFixed(0)}%</strong>
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                isActive 
                  ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/30 shadow-sm' 
                  : 'bg-surface text-text-secondary hover:bg-surface-elevated hover:text-text-primary border border-border'
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
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">Executive Summary</h4>
                <p className="text-sm font-semibold text-text-primary mt-1.5 leading-relaxed bg-surface-elevated/80 p-4 rounded-xl border border-border">{overviewData.executive_summary}</p>
              </div>
              <div className="border-t border-border pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">Incident Brief</h4>
                <p className="text-sm text-text-primary mt-1.5 leading-relaxed whitespace-pre-line bg-surface-elevated/80 p-4 rounded-xl border border-border">{overviewData.incident_brief}</p>
              </div>
            </div>
          </Card>
        )}

        {/* 2. TIMELINE */}
        {activeTab === 'timeline' && (
          <Card className="p-6">
            <CardHeader title="2. Chronological Case Timeline" />
            <div className="mt-5 space-y-4">
              {(!data.timeline || data.timeline.length === 0) ? (
                <p className="text-sm text-text-muted italic">No timeline events extracted.</p>
              ) : (
                data.timeline.map((event, idx) => (
                  <div key={idx} className="flex gap-4 items-start border-l-2 border-brand-primary pl-4 py-2 bg-surface-elevated/40 rounded-r-xl p-3 border border-border/50">
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-primary border border-brand-primary/20 font-mono">
                        {event.timestamp}
                      </span>
                      <p className="text-sm text-text-primary font-bold mt-1.5">{event.description}</p>
                      {event.supporting_evidence_ids && event.supporting_evidence_ids.length > 0 && (
                        <p className="text-xs text-text-secondary">
                          Evidence Ref: <span className="font-mono">{event.supporting_evidence_ids.join(', ')}</span>
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
                <p className="text-sm text-text-muted italic">No evidence items uploaded or analyzed.</p>
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

                    const confidenceValue = Number((evItem.confidence ?? ev.confidence ?? 0) || 0);
                    const confidencePct = confidenceValue > 1 ? confidenceValue : confidenceValue * 100;

                    return (
                      <div 
                        key={ev.evidence_id || idx} 
                        className="p-4 border border-border rounded-xl space-y-3 bg-surface-elevated/70 hover:bg-surface-elevated cursor-pointer transition-all shadow-xs"
                        onClick={() => setPreviewEvidence({ 
                          id: ev.evidence_id, 
                          name: ev.filename,
                          summary: summaryText,
                          caption: captionText
                        })}
                      >
                        <div className="flex justify-between items-center gap-3">
                          <span className="font-bold text-sm text-text-primary">{captionText}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 uppercase">{ev.importance || 'medium'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-secondary">
                          <span className="font-bold uppercase tracking-wider">Confidence Score:</span>
                          <span className="font-bold text-text-primary">{Math.round(confidencePct)}%</span>
                        </div>
                        {summaryText && <p className="text-xs text-text-secondary leading-relaxed">{summaryText}</p>}
                        {supports.length > 0 && (
                          <div className="pt-2 border-t border-border">
                            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Supports Allegations:</span>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {supports.map((alg: string, aIdx: number) => (
                                <span key={aIdx} className="px-2.5 py-0.5 text-[11px] bg-semantic-success/10 text-semantic-success border border-semantic-success/20 rounded-md font-bold">
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
                <p className="text-sm text-semantic-success bg-semantic-success/10 p-4 rounded-xl border border-semantic-success/30 font-bold">
                  No missing information or evidence items flagged.
                </p>
              ) : (
                missingItems.map((item, i) => (
                  <div key={i} className="p-4 border border-semantic-warning/30 bg-semantic-warning/10 rounded-xl text-xs space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-text-primary text-sm">{item.title}</span>
                      <span className="uppercase text-[10px] font-extrabold bg-semantic-warning/20 text-semantic-warning border border-semantic-warning/30 px-2 py-0.5 rounded-md shrink-0">{item.importance}</span>
                    </div>
                    <p className="text-text-secondary leading-relaxed">{item.description}</p>
                    {caseId && (
                      <div className="pt-1">
                        <button
                          onClick={() => handleRequestFromComplainant(item.title, item.description, item.importance)}
                          disabled={!!requestedItems[item.title]}
                          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${
                            requestedItems[item.title] === 'sent'
                              ? 'bg-semantic-success/20 text-semantic-success border border-semantic-success/30 cursor-default'
                              : requestedItems[item.title] === 'loading'
                              ? 'bg-surface-elevated text-text-muted border border-border cursor-not-allowed'
                              : 'bg-brand-primary text-white hover:bg-brand-primary/90 shadow-xs cursor-pointer'
                          }`}
                        >
                          {requestedItems[item.title] === 'sent' ? (
                            <><CheckCheck size={13} /> Requested from Complainant</>
                          ) : requestedItems[item.title] === 'loading' ? (
                            <><Loader2 size={13} className="animate-spin" /> Sending...</>
                          ) : (
                            <><Send size={13} /> Request from Complainant</>
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
                <p className="text-sm text-semantic-success bg-semantic-success/10 p-4 rounded-xl border border-semantic-success/30 font-bold">
                  No contradictions or conflicts detected across complaint and evidence.
                </p>
              ) : (
                data.contradictions.map((c, i) => {
                  const evIds = c.related_evidence_ids || c.involved_evidence_ids || [];
                  return (
                    <div key={i} className="p-4 border border-semantic-critical/30 bg-semantic-critical/10 rounded-xl text-xs text-semantic-critical font-bold space-y-1">
                      <p>&bull; {c.description}</p>
                      {evIds.length > 0 && (
                        <p className="text-[11px] text-semantic-critical/80">Involved Evidence IDs: {evIds.join(', ')}</p>
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
