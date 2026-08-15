'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { QrCode, Search, Send, CheckCircle2, ShieldAlert, FileText, ArrowRight, MapPin, Sparkles, AlertTriangle, Lock, Shield, Package, Camera, Upload, AlertCircle } from 'lucide-react';
import apiClient from '@/lib/axios';

interface ScanTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialTagId?: string;
  caseId?: string;
}

export function ScanTransferModal({ isOpen, onClose, onSuccess, initialTagId, caseId }: ScanTransferModalProps) {
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [evidenceItem, setEvidenceItem] = useState<any>(null);
  const [mode, setMode] = useState<'DISPATCH' | 'RECEIPT'>('DISPATCH');
  const [submitting, setSubmitting] = useState(false);
  const [autoFilledNotice, setAutoFilledNotice] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  // Case Items Quick Select Dropdown
  const [caseItemsList, setCaseItemsList] = useState<any[]>([]);

  // Dispatch Form State
  const [dispatchData, setDispatchData] = useState({
    transferAction: 'FSL_DISPATCH',
    destinationName: 'State Forensic Science Laboratory, DFS Gandhinagar',
    escortName: 'Const. Vikram Singh',
    escortBadge: 'GJ-8812',
    roadCertificateNo: '',
    remarks: '',
  });

  // Receipt Form State
  const [receiptData, setReceiptData] = useState({
    receiptLocation: 'FSL Main Receiving Desk',
    fslLabEntryNo: '',
    sealCondition: 'INTACT' as 'INTACT' | 'DAMAGED' | 'RE_SEALED',
    newSealNumber: '',
    remarks: '',
  });

  // Robust Tag Lookup Handler (handles raw Tag ID, #Tag ID, scanned QR JSON, or freeform text)
  const performLookup = useCallback(async (rawString: string) => {
    if (!rawString.trim()) return;

    setLoading(true);
    setEvidenceItem(null);
    setAutoFilledNotice(null);
    setModalError(null);
    setModalSuccess(null);

    try {
      let cleanTag = rawString.trim();

      // 1. If scanned input is a JSON string from QR code (e.g. {"tagId":"PEV-2026-A3FED4",...})
      if (cleanTag.startsWith('{')) {
        try {
          const parsed = JSON.parse(cleanTag);
          if (parsed.tagId) cleanTag = parsed.tagId;
        } catch (e) {}
      }

      // 2. Extract Tag ID using Regex (e.g. PEV-2026-F542D0 or PEV-2026-A4A0A0)
      const match = cleanTag.match(/PEV-[A-Z0-9-]+/i);
      if (match) {
        cleanTag = match[0];
      } else {
        cleanTag = cleanTag.replace('#', '');
      }
      cleanTag = cleanTag.toUpperCase();

      const res = await apiClient.get(`/physical-evidence/tag/${cleanTag}`);
      const item = res.data.data;
      if (!item) {
        setModalError(`No physical evidence item found for Tag ID "${cleanTag}".`);
        return;
      }

      setEvidenceItem(item);
      setTagInput(item.evidenceTagId);

      // Smart State Transition Auto-fill & Tab Locking
      if (item.status?.includes('IN_TRANSIT')) {
        setMode('RECEIPT');
        const lastNode = item.custodyChain?.[item.custodyChain.length - 1];
        setReceiptData((prev) => ({
          ...prev,
          receiptLocation: lastNode?.toLocation || 'FSL Main Receiving Desk',
          sealCondition: 'INTACT',
        }));
        setAutoFilledNotice(
          `Form Portal Opened: Item is IN TRANSIT under RC #${
            lastNode?.roadCertificateNo || 'N/A'
          }. Form pre-filled & locked to '2. Acknowledge Receipt'.`
        );
      } else if (item.status === 'STORED_AT_FSL') {
        setMode('DISPATCH');
        setDispatchData((prev) => ({
          ...prev,
          transferAction: 'STATION_TRANSFER',
          destinationName: 'PS-CENTRAL-01 Malkhana Vault',
        }));
        setAutoFilledNotice('Form Portal Opened: Item stored at FSL. Form pre-filled for return transfer back to Police Malkhana.');
      } else {
        setMode('DISPATCH');
        setDispatchData((prev) => ({
          ...prev,
          transferAction: 'FSL_DISPATCH',
          destinationName: 'State Forensic Science Laboratory, DFS Gandhinagar',
        }));
        setAutoFilledNotice('Form Portal Opened: Item stored at Malkhana. Form pre-filled with FSL Dispatch details.');
      }
    } catch (err: any) {
      setModalError(err.response?.data?.message || err.message || 'Tag Lookup Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle Input Changes with Instant Extraction
  const handleInputChange = (val: string) => {
    setTagInput(val);
    setModalError(null);
    const match = val.match(/PEV-[A-Z0-9-]+/i) || val.startsWith('{');
    if (match) {
      performLookup(val);
    }
  };

  // Handle Camera/Image QR Scan File Upload
  const handleQRPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const match = text.match(/PEV-[A-Z0-9-]+/i);
      if (match) {
        performLookup(match[0]);
      } else {
        setModalError('Could not auto-detect barcode from image. Please enter or select the Tag ID from dropdown.');
      }
    };
    reader.readAsText(file);
  };

  // Auto-trigger lookup when scanning barcode or pasting JSON / Tag ID
  useEffect(() => {
    if (!tagInput || evidenceItem || loading) return;
    const isTagMatch = tagInput.match(/PEV-[A-Z0-9-]+/i) || tagInput.startsWith('{');
    if (isTagMatch) {
      const timer = setTimeout(() => {
        performLookup(tagInput);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [tagInput, evidenceItem, loading, performLookup]);

  // Fetch case items for quick select if caseId is provided
  useEffect(() => {
    if (isOpen && caseId) {
      apiClient.get(`/physical-evidence/cases/${caseId}/physical-evidence`)
        .then((res) => setCaseItemsList(res.data.data || []))
        .catch((err) => console.error('Failed to load case items for quick select', err));
    }
  }, [isOpen, caseId]);

  // Auto-lookup if initialTagId is passed when opening modal
  useEffect(() => {
    if (isOpen && initialTagId) {
      setTagInput(initialTagId);
      performLookup(initialTagId);
    }
  }, [isOpen, initialTagId, performLookup]);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLookup(tagInput);
  };

  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidenceItem) return;
    setModalError(null);

    setSubmitting(true);
    try {
      await apiClient.post(`/physical-evidence/${evidenceItem._id}/dispatch`, {
        transferAction: dispatchData.transferAction,
        destinationName: dispatchData.destinationName,
        escortOfficer: {
          id: dispatchData.escortBadge || 'CONST-991',
          name: dispatchData.escortName,
          badge: dispatchData.escortBadge,
          station: 'District Escort Pool',
        },
        roadCertificateNo: dispatchData.roadCertificateNo || undefined,
        remarks: dispatchData.remarks || `Dispatched to ${dispatchData.destinationName}`,
      });

      setModalSuccess('Dispatched successfully! Road Certificate & Custody Chain Hash generated.');
      onSuccess();
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err: any) {
      setModalError(err.response?.data?.message || err.message || 'Dispatch failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidenceItem) return;
    setModalError(null);

    setSubmitting(true);
    try {
      await apiClient.post(`/physical-evidence/${evidenceItem._id}/acknowledge`, {
        receiptLocation: receiptData.receiptLocation,
        fslLabEntryNo: receiptData.fslLabEntryNo || undefined,
        sealCondition: receiptData.sealCondition,
        newSealNumber: receiptData.newSealNumber || undefined,
        remarks: receiptData.remarks || `Receipt acknowledged at ${receiptData.receiptLocation}`,
      });

      setModalSuccess('Receipt acknowledged! Custody chain hash verified and sealed.');
      onSuccess();
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err: any) {
      setModalError(err.response?.data?.message || err.message || 'Receipt acknowledgment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setTagInput('');
    setEvidenceItem(null);
    setAutoFilledNotice(null);
    setModalError(null);
    setModalSuccess(null);
    onClose();
  };

  const isTransiting = evidenceItem?.status?.includes('IN_TRANSIT');

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Scan QR Barcode & Handover Transfer Portal">
      <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
        
        {/* Inline Error Alert Banner */}
        {modalError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center gap-2 shadow-2xs">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <div>{modalError}</div>
          </div>
        )}

        {/* Inline Success Alert Banner */}
        {modalSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-900 flex items-center gap-2 shadow-2xs">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <div>{modalSuccess}</div>
          </div>
        )}

        {/* QR Scanner / Tag Input Box */}
        <form onSubmit={handleLookupSubmit} className="space-y-2">
          <label className="block text-[11px] font-bold text-slate-700 uppercase flex items-center justify-between">
            <span>Scan QR Barcode / Enter Tag ID / Paste Scanned String</span>
            <label className="text-blue-700 hover:text-blue-900 cursor-pointer flex items-center gap-1 font-sans text-[10px]">
              <Camera size={12} /> Scan Tag File
              <input type="file" accept="image/*,.txt" onChange={handleQRPhotoUpload} className="hidden" />
            </label>
          </label>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <QrCode size={16} className="absolute left-3 top-3 text-blue-700" />
              <input
                type="text"
                placeholder="Scan barcode sticker or enter Tag ID (e.g. PEV-2026-F542D0)..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 font-mono font-bold"
                value={tagInput}
                onChange={(e) => handleInputChange(e.target.value)}
              />
            </div>
            <Button type="submit" isLoading={loading} className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2 rounded-xl">
              <Search size={14} className="mr-1" /> Open Form
            </Button>
          </div>

          {/* Quick Select Dropdown from Logged Case Items */}
          {caseItemsList.length > 0 && !evidenceItem && (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] text-slate-500 font-medium">Or Quick Select:</span>
              <select
                className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-mono font-bold focus:border-blue-600"
                onChange={(e) => {
                  if (e.target.value) performLookup(e.target.value);
                }}
                defaultValue=""
              >
                <option value="" disabled>Choose logged evidence item to open form...</option>
                {caseItemsList.map((item) => (
                  <option key={item._id} value={item.evidenceTagId}>
                    Tag #{item.evidenceTagId} — {item.itemName} ({item.status?.replace(/_/g, ' ')})
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>

        {/* Smart Pre-fill Notice Banner */}
        {autoFilledNotice && (
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs font-semibold text-blue-900 flex items-center gap-2 shadow-2xs">
            <Sparkles size={16} className="text-blue-700 shrink-0" />
            <div>{autoFilledNotice}</div>
          </div>
        )}

        {/* Evidence Details Preview Card & Auto-opened Filling Form */}
        {evidenceItem && (
          <div className="space-y-4 pt-1">
            <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                  Tag #{evidenceItem.evidenceTagId}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isTransiting ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-800 text-white'
                }`}>
                  {evidenceItem.status?.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="text-sm font-bold text-slate-900">{evidenceItem.itemName}</div>
              <div className="text-xs text-slate-600 line-clamp-1">{evidenceItem.description}</div>
              <div className="text-[11px] text-slate-500 font-mono flex flex-wrap gap-3 pt-2 border-t border-slate-200">
                <span>Panchnama: #{evidenceItem.seizureMemoNo}</span>
                <span>Seal #: {evidenceItem.sealNumber}</span>
                <span>Holder: {evidenceItem.currentCustodian?.holderName}</span>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                disabled={isTransiting}
                onClick={() => setMode('DISPATCH')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  mode === 'DISPATCH'
                    ? 'bg-blue-900 text-white shadow-xs'
                    : isTransiting
                    ? 'text-slate-400 cursor-not-allowed opacity-50'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. Outward Dispatch Form
              </button>
              <button
                type="button"
                disabled={!isTransiting}
                onClick={() => setMode('RECEIPT')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  mode === 'RECEIPT'
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : !isTransiting
                    ? 'text-slate-400 cursor-not-allowed opacity-50'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2. Inward Receipt Acknowledgment Form
              </button>
            </div>

            {/* Mode A: Dispatch Form Portal */}
            {mode === 'DISPATCH' && (
              <form onSubmit={handleDispatchSubmit} className="space-y-3 p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <Send size={14} className="text-blue-700" /> Outward Dispatch & Road Certificate (RC) Generation
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Transfer Action</label>
                    <select
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 font-medium"
                      value={dispatchData.transferAction}
                      onChange={(e) => setDispatchData({ ...dispatchData, transferAction: e.target.value })}
                    >
                      <option value="FSL_DISPATCH">Dispatch to Forensic Science Lab (FSL)</option>
                      <option value="COURT_PRODUCTION">Produce in Judicial Court (Muddamal Exhibit)</option>
                      <option value="HOSPITAL_MEDICAL_DISPATCH">Dispatch to Hospital / Medical Examiner</option>
                      <option value="STATION_TRANSFER">Transfer to Police Station Malkhana / District Vault</option>
                      <option value="FACILITY_DISPATCH">Transfer to Specialized Agency (Customs / Excise / CID)</option>
                      <option value="RELEASE_TO_OWNER">Release to Rightful Owner (Superdnama / Court Order)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Destination Location Name *</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 font-medium"
                      value={dispatchData.destinationName}
                      onChange={(e) => setDispatchData({ ...dispatchData, destinationName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Escort Officer / Courier Name *</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 font-medium"
                      value={dispatchData.escortName}
                      onChange={(e) => setDispatchData({ ...dispatchData, escortName: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Escort Officer Badge / ID</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 font-medium"
                      value={dispatchData.escortBadge}
                      onChange={(e) => setDispatchData({ ...dispatchData, escortBadge: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Road Certificate (RC) Number (Optional)</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 font-mono font-bold"
                      placeholder="e.g. RC-2026-1480 (Auto-generated if empty)"
                      value={dispatchData.roadCertificateNo}
                      onChange={(e) => setDispatchData({ ...dispatchData, roadCertificateNo: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Dispatch Remarks</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600"
                      placeholder="Dispatched for chemical/ballistic analysis..."
                      value={dispatchData.remarks}
                      onChange={(e) => setDispatchData({ ...dispatchData, remarks: e.target.value })}
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button variant="ghost" type="button" onClick={handleClose} disabled={submitting} className="text-xs">
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={submitting} className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs">
                    Confirm Dispatch & Issue RC
                  </Button>
                </div>
              </form>
            )}

            {/* Mode B: Receipt Acknowledgment Form Portal */}
            {mode === 'RECEIPT' && (
              <form onSubmit={handleReceiptSubmit} className="space-y-3 p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5 border-b border-slate-100 pb-2">
                  <CheckCircle2 size={14} className="text-emerald-700" /> Inward Receipt Acknowledgment & Seal Audit
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Receiving Facility / Desk Location *</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 font-medium"
                      value={receiptData.receiptLocation}
                      onChange={(e) => setReceiptData({ ...receiptData, receiptLocation: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Wax Seal Audit Condition *</label>
                    <select
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 font-medium"
                      value={receiptData.sealCondition}
                      onChange={(e) => setReceiptData({ ...receiptData, sealCondition: e.target.value as any })}
                    >
                      <option value="INTACT">INTACT - Seal original & undamaged</option>
                      <option value="DAMAGED">DAMAGED - Seal broken/tampered (Flagged)</option>
                      <option value="RE_SEALED">RE-SEALED - Opened for lab test & resealed</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">FSL Lab Entry / Register # (If applicable)</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600 font-mono font-bold"
                      placeholder="e.g. FSL-2026-881"
                      value={receiptData.fslLabEntryNo}
                      onChange={(e) => setReceiptData({ ...receiptData, fslLabEntryNo: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Receipt Remarks / Examination Notes</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-blue-600"
                      placeholder="Received parcel intact at FSL desk..."
                      value={receiptData.remarks}
                      onChange={(e) => setReceiptData({ ...receiptData, remarks: e.target.value })}
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <Button variant="ghost" type="button" onClick={handleClose} disabled={submitting} className="text-xs">
                    Cancel
                  </Button>
                  <Button type="submit" isLoading={submitting} className="bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs">
                    Acknowledge Receipt & Verify SHA-256
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
