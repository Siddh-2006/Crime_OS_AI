'use client';

import React, { useEffect, useState } from 'react';
import { X, Activity } from 'lucide-react';
import apiClient from '@/lib/axios';
import { Loader } from '@/components/ui/Loader';

interface SnapshotDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  snapshotId: string;
}

export default function SnapshotDetailModal({ isOpen, onClose, caseId, snapshotId }: SnapshotDetailModalProps) {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && snapshotId) {
      setLoading(true);
      apiClient.get(`/cases/${caseId}/analysis/${snapshotId}`)
        .then((res) => {
          setSnapshot(res.data.data);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setSnapshot(null);
    }
  }, [isOpen, caseId, snapshotId]);

  if (!isOpen) return null;

  const confidencePercent = snapshot?.confidence_breakdown?.final_score !== undefined
    ? `${Math.round(Number(snapshot.confidence_breakdown.final_score) * 100)}%`
    : 'N/A';
  const rankedSteps = Array.isArray(snapshot?.ranked_next_steps) ? snapshot.ranked_next_steps : [];
  const narrative = snapshot?.narrative_summary || 'No narrative available.';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col h-[85vh] max-h-[850px] overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
              <Activity size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900">Analysis Snapshot</h2>
              <p className="text-xs text-neutral-500">ID: {snapshotId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-neutral-50/30">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Loader /></div>
          ) : !snapshot ? (
            <div className="h-full flex items-center justify-center text-neutral-400 italic">Snapshot not found</div>
          ) : (
            <div className="space-y-6">
              {/* Overall Confidence */}
              <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-sm flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-neutral-700">Investigation Confidence</h3>
                  <p className="text-xs text-neutral-500">Based on evidence verified at the time</p>
                </div>
                <div className="text-2xl font-black text-blue-600">
                  {confidencePercent}
                </div>
              </div>

              {/* Narrative */}
              <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-sm">
                <h3 className="text-sm font-bold text-neutral-800 mb-3 border-b border-neutral-100 pb-2">AI Narrative</h3>
                <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">
                  {narrative}
                </p>
              </div>

              {/* Ranked Steps */}
              {rankedSteps.length > 0 && (
                <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-sm">
                  <h3 className="text-sm font-bold text-neutral-800 mb-3 border-b border-neutral-100 pb-2">Suggested Next Steps</h3>
                  <div className="space-y-3">
                    {rankedSteps.map((step: any, idx: number) => (
                      <div key={idx} className="flex gap-3 items-start">
                        <div className="bg-neutral-100 text-neutral-500 font-bold text-xs h-6 w-6 rounded flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-neutral-900">{step.step_id.replace(/_/g, ' ').toUpperCase()}</p>
                          <p className="text-xs text-neutral-500 mt-1">{step.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
