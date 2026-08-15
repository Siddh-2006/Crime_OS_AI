'use client';

import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, ArrowRight, FileText, CheckCircle2, Clock, MapPin, UserCheck, Eye, Tag, FileCheck, Shield } from 'lucide-react';
import apiClient from '@/lib/axios';
import { Modal } from '@/components/ui/Modal';

interface CustodyNode {
  step: number;
  timestamp: string;
  transferAction: string;
  fromOfficer: { name: string; badge?: string; station?: string };
  toOfficer: { name: string; badge?: string; station?: string };
  fromLocation: string;
  toLocation: string;
  roadCertificateNo?: string;
  fslLabEntryNo?: string;
  sealNumberOnTransfer: string;
  sealCondition: 'INTACT' | 'DAMAGED' | 'RE_SEALED';
  previousHash: string;
  currentHash: string;
  transferStatus: string;
  remarks?: string;
}

interface CustodyTimelineVisualizerProps {
  evidenceId: string;
  evidenceTagId: string;
  custodyChain: CustodyNode[];
}

export function CustodyTimelineVisualizer({ evidenceId, evidenceTagId, custodyChain }: CustodyTimelineVisualizerProps) {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ isValid: boolean; message: string } | null>(null);
  const [selectedDetailNode, setSelectedDetailNode] = useState<CustodyNode | null>(null);

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await apiClient.get(`/physical-evidence/${evidenceId}/verify`);
      setVerificationResult(res.data.data);
    } catch (e: any) {
      setVerificationResult({ isValid: false, message: e.response?.data?.message || 'Verification failed' });
    } finally {
      setVerifying(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INITIAL_SEIZURE':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">SEIZURE LOGGED</span>;
      case 'MALKHANA_DEPOSIT':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 shadow-2xs">MALKHANA STORED</span>;
      case 'FSL_DISPATCH':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200 shadow-2xs">DISPATCHED TO FSL</span>;
      case 'FSL_RECEIPT':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">ACCEPTED AT FSL</span>;
      case 'COURT_PRODUCTION':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs">COURT PRODUCED</span>;
      case 'RELEASE_TO_OWNER':
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs">RELEASED TO OWNER</span>;
      default:
        return <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">{action.replace(/_/g, ' ')}</span>;
    }
  };

  return (
    <div className="space-y-3 font-sans">
      
      {/* Ledger Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Chain of Custody Table Ledger</div>
          <div className="text-xs font-bold font-mono text-slate-900 flex items-center gap-1.5 mt-0.5">
            <span>Tag #{evidenceTagId}</span>
            <span className="text-[10px] text-emerald-800 font-sans font-medium flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle2 size={11} /> {custodyChain.length} Custody Transfers
            </span>
          </div>
        </div>

        <button
          onClick={handleVerifyChain}
          disabled={verifying}
          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-900 hover:bg-blue-800 text-white flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-50"
        >
          <ShieldCheck size={14} />
          {verifying ? 'Verifying...' : 'Verify Chain Integrity'}
        </button>
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <div className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold ${
          verificationResult.isValid
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900 shadow-2xs'
            : 'bg-rose-50 border-rose-200 text-rose-900 shadow-2xs'
        }`}>
          {verificationResult.isValid ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <ShieldAlert size={16} className="text-rose-600 shrink-0" />
          )}
          <div>{verificationResult.message}</div>
        </div>
      )}

      {/* ── HIGH-DENSITY LEDGER AUDIT TABLE ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 font-medium flex items-center justify-between">
          <span>Click any row to inspect complete transfer record & officer metadata.</span>
          <span className="text-slate-400 text-[10px] font-mono">Row Click = Full Record</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
              <tr>
                <th className="p-3 w-12 text-center">Step</th>
                <th className="p-3">Transfer Action</th>
                <th className="p-3">Handed By</th>
                <th className="p-3">Received By / Destination</th>
                <th className="p-3">Paperwork & Seal</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {custodyChain.map((node, index) => (
                <tr
                  key={index}
                  onClick={() => setSelectedDetailNode(node)}
                  className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                >
                  <td className="p-3 font-mono font-bold text-slate-900 text-center bg-slate-50/50 group-hover:bg-blue-100/40">
                    #{node.step}
                  </td>
                  <td className="p-3">{getActionBadge(node.transferAction)}</td>
                  <td className="p-3">
                    <div className="font-bold text-slate-900">{node.fromOfficer.name}</div>
                    <div className="text-[10px] text-slate-500 line-clamp-1">{node.fromOfficer.station || node.fromLocation}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-slate-900">{node.toOfficer.name}</div>
                    <div className="text-[10px] text-slate-500 line-clamp-1">{node.toOfficer.station || node.toLocation}</div>
                  </td>
                  <td className="p-3 font-mono text-[11px]">
                    {node.roadCertificateNo && (
                      <span className="text-blue-900 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[10px] mr-1 inline-block mb-0.5">
                        RC #{node.roadCertificateNo}
                      </span>
                    )}
                    <div className="text-slate-600 text-[10px]">Seal: {node.sealNumberOnTransfer} ({node.sealCondition})</div>
                  </td>
                  <td className="p-3 text-slate-600 font-mono text-[11px]">
                    <div>{new Date(node.timestamp).toLocaleDateString()}</div>
                    <div className="text-[10px] text-slate-400">{new Date(node.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedDetailNode(node); }}
                      className="px-3 py-1 text-xs font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-all inline-flex items-center gap-1 shadow-2xs"
                    >
                      <Eye size={13} /> Inspect Record
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CUSTODY NODE FULL DETAILS WIDE MODAL (size="xl") ── */}
      {selectedDetailNode && (
        <Modal
          isOpen={!!selectedDetailNode}
          onClose={() => setSelectedDetailNode(null)}
          title={`Custody Step #${selectedDetailNode.step} Transfer Details`}
          size="xl"
        >
          <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1 text-xs font-sans">
            
            {/* Soft Light Theme Header Card */}
            <div className="bg-blue-50/80 p-4.5 rounded-xl border border-blue-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                    STEP #{selectedDetailNode.step}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    {selectedDetailNode.transferAction.replace(/_/g, ' ')}
                  </h3>
                </div>
                <div className="text-xs font-mono text-slate-600 flex items-center gap-2 pt-0.5">
                  <span className="flex items-center gap-1"><Clock size={12} className="text-slate-500" /> {new Date(selectedDetailNode.timestamp).toLocaleString()}</span>
                  <span>•</span>
                  <span>Tag ID: #{evidenceTagId}</span>
                </div>
              </div>
              <div>{getActionBadge(selectedDetailNode.transferAction)}</div>
            </div>

            {/* Handover Officer Card - 2 Column Wide Grid */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-1.5">
                <UserCheck size={16} className="text-blue-700" /> Custodian Handover Breakdown
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Handed By (Dispatched From)</div>
                  <div className="text-base font-bold text-slate-900">{selectedDetailNode.fromOfficer.name}</div>
                  <div className="text-xs text-slate-600 font-mono">Badge / ID: <strong className="text-slate-900">{selectedDetailNode.fromOfficer.badge || 'N/A'}</strong></div>
                  <div className="text-xs text-slate-600 flex items-center gap-1">
                    <MapPin size={12} className="text-slate-400" />
                    <span>Location: <strong className="text-slate-900">{selectedDetailNode.fromOfficer.station || selectedDetailNode.fromLocation}</strong></span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 shadow-2xs">
                  <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Received By (Destination)</div>
                  <div className="text-base font-bold text-slate-900">{selectedDetailNode.toOfficer.name}</div>
                  <div className="text-xs text-slate-600 font-mono">Badge / ID: <strong className="text-slate-900">{selectedDetailNode.toOfficer.badge || 'N/A'}</strong></div>
                  <div className="text-xs text-slate-600 flex items-center gap-1">
                    <MapPin size={12} className="text-slate-400" />
                    <span>Location: <strong className="text-slate-900">{selectedDetailNode.toOfficer.station || selectedDetailNode.toLocation}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Paperwork, Seal & Remarks */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-1.5">
                <FileText size={16} className="text-blue-700" /> Paperwork & Physical Seal Audit
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Road Certificate #</span>
                  <span className="font-mono font-bold text-blue-900 text-xs">{selectedDetailNode.roadCertificateNo || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">FSL Lab Entry #</span>
                  <span className="font-mono font-bold text-purple-900 text-xs">{selectedDetailNode.fslLabEntryNo || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Wax Seal Number</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">{selectedDetailNode.sealNumberOnTransfer}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Seal Audit Condition</span>
                  <span className={`font-bold text-xs ${
                    selectedDetailNode.sealCondition === 'INTACT' ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    {selectedDetailNode.sealCondition}
                  </span>
                </div>
              </div>

              {selectedDetailNode.remarks && (
                <div className="pt-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Transfer Examination Notes & Remarks</span>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs text-slate-800 leading-relaxed italic shadow-2xs">
                    "{selectedDetailNode.remarks}"
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedDetailNode(null)}
                className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-xl transition-all shadow-xs"
              >
                Close Transfer Record
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
