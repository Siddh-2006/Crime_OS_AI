'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, ArrowRight, Camera, CheckCircle2, Clock, Download, FileText, Lock, MapPin, Printer, Send, Shield, ShieldAlert, ShieldCheck, Upload, UserCheck } from 'lucide-react';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api/v1';

export default function VerifyCustodyPublicPage() {
  const params = useParams();
  const rawTag = params?.tagId as string;

  const [loading, setLoading] = useState(true);
  const [evidenceItem, setEvidenceItem] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Active Action Mode ('RECEIPT' for receiving, 'DISPATCH' for returning parcel back to police)
  const [portalMode, setPortalMode] = useState<'RECEIPT' | 'DISPATCH'>('RECEIPT');

  // Verification Step & Form State
  const [verificationStep, setVerificationStep] = useState<'VERIFY_PIN' | 'FILL_FORM' | 'SUCCESS'>('VERIFY_PIN');
  
  // Security Verification Input
  const [securityData, setSecurityData] = useState({
    roadCertificateNo: '',
    recipientName: '',
    badgeOrId: '',
    facilityName: 'State Forensic Science Laboratory, DFS Gandhinagar',
  });

  // Receipt Form Input
  const [receiptData, setReceiptData] = useState({
    sealCondition: 'INTACT' as 'INTACT' | 'DAMAGED' | 'RE_SEALED',
    fslLabEntryNo: '',
    remarks: '',
    receiptPhotoUrl: '',
  });

  // Return Dispatch Input (FSL -> Police Station Return)
  const [dispatchData, setDispatchData] = useState({
    destinationName: 'PS-CENTRAL-01 Malkhana Vault',
    escortName: 'Const. Vikram Singh',
    escortBadge: 'GJ-8812',
    roadCertificateNo: '',
    remarks: '',
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!rawTag) return;
    fetchTagData();
  }, [rawTag]);

  const fetchTagData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const cleanTag = rawTag.trim().toUpperCase().replace('#', '');
      const res = await axios.get(`${API_BASE}/physical-evidence/tag/${cleanTag}`);
      const item = res.data.data;
      setEvidenceItem(item);

      // Auto-prefill based on item status
      if (item.status?.includes('IN_TRANSIT')) {
        setPortalMode('RECEIPT');
        const lastNode = item.custodyChain?.[item.custodyChain.length - 1];
        setSecurityData((prev) => ({
          ...prev,
          roadCertificateNo: lastNode?.roadCertificateNo || '',
          facilityName: lastNode?.toLocation || 'State Forensic Science Laboratory, DFS Gandhinagar',
        }));
      } else if (item.status === 'STORED_AT_FSL') {
        setPortalMode('DISPATCH');
        setDispatchData((prev) => ({
          ...prev,
          destinationName: 'PS-CENTRAL-01 Malkhana Vault',
        }));
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Evidence Tag not found or invalid QR code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPIN = (e: React.FormEvent) => {
    e.preventDefault();
    setPageError(null);

    if (!securityData.recipientName || !securityData.facilityName) {
      setPageError('Please fill out Official Full Name and Facility Name.');
      return;
    }

    // Check if Road Certificate # matches (if in transit receiving)
    const lastNode = evidenceItem?.custodyChain?.[evidenceItem.custodyChain.length - 1];
    const expectedRC = lastNode?.roadCertificateNo;

    if (portalMode === 'RECEIPT' && expectedRC && securityData.roadCertificateNo.trim().toUpperCase() !== expectedRC.trim().toUpperCase()) {
      setPageError(`Invalid Security PIN / RC #. Expected Road Certificate #${expectedRC} printed on physical paperwork.`);
      return;
    }

    setVerificationStep('FILL_FORM');
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setPageError(null);
    setSubmitting(true);

    try {
      await axios.post(`${API_BASE}/physical-evidence/${evidenceItem._id}/acknowledge`, {
        receiptLocation: securityData.facilityName,
        fslLabEntryNo: receiptData.fslLabEntryNo || undefined,
        sealCondition: receiptData.sealCondition,
        newSealNumber: undefined,
        remarks: receiptData.remarks || `Inward receipt acknowledged at ${securityData.facilityName}`,
        receivedByOfficer: {
          id: securityData.badgeOrId || 'FSL-GOVT-OFFICER',
          name: securityData.recipientName,
          badge: securityData.badgeOrId || 'DFS-FSL-ID',
          station: securityData.facilityName,
        },
      });

      setVerificationStep('SUCCESS');
      fetchTagData();
    } catch (err: any) {
      setPageError(err.response?.data?.message || err.message || 'Receipt Submission Failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReturnDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setPageError(null);
    setSubmitting(true);

    try {
      await axios.post(`${API_BASE}/physical-evidence/${evidenceItem._id}/dispatch`, {
        transferAction: 'STATION_TRANSFER',
        destinationName: dispatchData.destinationName,
        escortOfficer: {
          id: dispatchData.escortBadge || 'CONST-RETURN-99',
          name: dispatchData.escortName,
          badge: dispatchData.escortBadge,
          station: securityData.facilityName,
        },
        roadCertificateNo: dispatchData.roadCertificateNo || undefined,
        remarks: dispatchData.remarks || `FSL examination complete. Parcel dispatched back to ${dispatchData.destinationName}`,
      });

      setVerificationStep('SUCCESS');
      fetchTagData();
    } catch (err: any) {
      setPageError(err.response?.data?.message || err.message || 'Dispatch Failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md text-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-bold text-slate-800">Verifying Evidence QR Tag...</div>
        </div>
      </div>
    );
  }

  if (errorMsg || !evidenceItem) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md text-center space-y-3 max-w-md">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-200">
            <ShieldAlert size={24} />
          </div>
          <h3 className="text-base font-bold text-slate-900">Tag Verification Failed</h3>
          <p className="text-xs text-slate-600 leading-relaxed">{errorMsg}</p>
        </div>
      </div>
    );
  }

  const isTransiting = evidenceItem.status?.includes('IN_TRANSIT');

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 font-sans text-slate-900">
      <div className="max-w-2xl mx-auto space-y-4">
        
        {/* Header Branding */}
        <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-950 border border-blue-800 rounded-xl flex items-center justify-center text-blue-400 font-bold shrink-0">
              <Shield size={22} />
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-widest">GUJARAT POLICE EVIDENCE PORTAL</div>
              <h1 className="text-base font-bold text-white">Public Handover & Custody Verification</h1>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-blue-900/80 text-blue-200 px-2.5 py-1 rounded-full border border-blue-500/40">
            BNSS 2023 Compliant
          </span>
        </div>

        {/* Inline Error Alert Banner */}
        {pageError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center gap-2 shadow-2xs">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <div>{pageError}</div>
          </div>
        )}

        {/* Evidence Asset Summary Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Tag #{evidenceItem.evidenceTagId}
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-1">{evidenceItem.itemName}</h2>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase ${
              isTransiting ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
            }`}>
              {evidenceItem.status?.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="text-[10px] font-bold uppercase text-slate-500">Seizure Memo / Panchnama</div>
              <div className="font-bold text-slate-900 font-mono mt-0.5">#{evidenceItem.seizureMemoNo}</div>
              <div className="text-[11px] text-slate-600 mt-1">Seized By: {evidenceItem.seizedByOfficerName}</div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="text-[10px] font-bold uppercase text-slate-500">Wax Seal ID & Status</div>
              <div className="font-bold text-slate-900 font-mono mt-0.5">{evidenceItem.sealNumber}</div>
              <div className="text-[11px] text-emerald-700 font-bold mt-1">Status: {evidenceItem.sealStatus || 'INTACT'}</div>
            </div>
          </div>

          {evidenceItem.itemPhotoUrl && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Seizure Spot Photo</div>
              <img src={evidenceItem.itemPhotoUrl} alt="Evidence Spot" className="w-full h-44 object-cover rounded-xl border border-slate-200" />
            </div>
          )}
        </div>

        {/* Portal Mode Switcher */}
        <div className="flex bg-slate-200/70 p-1 rounded-2xl border border-slate-300">
          <button
            type="button"
            disabled={isTransiting}
            onClick={() => { setPortalMode('DISPATCH'); setVerificationStep('VERIFY_PIN'); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              portalMode === 'DISPATCH'
                ? 'bg-blue-900 text-white shadow-xs'
                : isTransiting
                ? 'text-slate-400 cursor-not-allowed opacity-50'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload size={14} aria-hidden="true" /> Return Parcel to Police (Outward)
          </button>
          <button
            type="button"
            disabled={!isTransiting}
            onClick={() => { setPortalMode('RECEIPT'); setVerificationStep('VERIFY_PIN'); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              portalMode === 'RECEIPT'
                ? 'bg-emerald-800 text-white shadow-xs'
                : !isTransiting
                ? 'text-slate-400 cursor-not-allowed opacity-50'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Download size={14} aria-hidden="true" /> Acknowledge Inward Receipt
          </button>
        </div>

        {/* ── STEP 1: OFFICIAL IDENTITY & SECURITY PIN VERIFICATION ── */}
        {verificationStep === 'VERIFY_PIN' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5 uppercase">
                <Lock size={14} className="text-blue-700" /> Step 1: External Official Identity Verification
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {portalMode === 'RECEIPT'
                  ? 'Enter the Road Certificate Security PIN printed on the physical paperwork handed over by the escort constable.'
                  : 'Enter your FSL Officer details to initiate parcel return dispatch back to Police Station Malkhana.'}
              </p>
            </div>

            <form onSubmit={handleVerifyPIN} className="space-y-3">
              {portalMode === 'RECEIPT' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Road Certificate (RC) Number / Security PIN *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. RC-2026-6465 (Printed on paper copy)"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono font-bold"
                    value={securityData.roadCertificateNo}
                    onChange={(e) => setSecurityData({ ...securityData, roadCertificateNo: e.target.value })}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Official Full Name (Scientist / Clerk) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. A. Mehta (FSL Scientist)"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                    value={securityData.recipientName}
                    onChange={(e) => setSecurityData({ ...securityData, recipientName: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Govt ID / FSL Badge Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DFS-FSL-1049"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                    value={securityData.badgeOrId}
                    onChange={(e) => setSecurityData({ ...securityData, badgeOrId: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Facility / Office Desk Location *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. State Forensic Science Laboratory, DFS Gandhinagar"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                  value={securityData.facilityName}
                  onChange={(e) => setSecurityData({ ...securityData, facilityName: e.target.value })}
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 mt-2"
              >
                Verify & Open {portalMode === 'RECEIPT' ? 'Inward Receipt' : 'Return Dispatch'} Form <ArrowRight size={14} />
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 2A: INWARD RECEIPT & SEAL AUDIT FORM ── */}
        {verificationStep === 'FILL_FORM' && portalMode === 'RECEIPT' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5 uppercase">
                <CheckCircle2 size={16} className="text-emerald-700" /> Step 2: Physical Seal Audit & Inward Receipt Form
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Inspect physical wax seal condition and acknowledge inward receipt for SHA-256 custody ledger.
              </p>
            </div>

            <form onSubmit={handleSubmitReceipt} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Wax Seal Audit Condition *
                  </label>
                  <select
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                    value={receiptData.sealCondition}
                    onChange={(e) => setReceiptData({ ...receiptData, sealCondition: e.target.value as any })}
                  >
                    <option value="INTACT">INTACT - Seal original & undamaged</option>
                    <option value="DAMAGED">DAMAGED - Seal broken/tampered (Flagged)</option>
                    <option value="RE_SEALED">RE-SEALED - Opened for lab test & resealed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    FSL Lab Entry / Register Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. FSL-2026-9912"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono font-bold"
                    value={receiptData.fslLabEntryNo}
                    onChange={(e) => setReceiptData({ ...receiptData, fslLabEntryNo: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Examination / Receipt Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Received parcel intact at receiving counter. Chemical analysis pending..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                  value={receiptData.remarks}
                  onChange={(e) => setReceiptData({ ...receiptData, remarks: e.target.value })}
                />
              </div>

              <div className="pt-2 flex justify-between items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVerificationStep('VERIFY_PIN')}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2.5 px-6 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Submitting Receipt...' : 'Acknowledge Receipt & Seal SHA-256'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── STEP 2B: RETURN DISPATCH FORM (FSL -> POLICE STATION) ── */}
        {verificationStep === 'FILL_FORM' && portalMode === 'DISPATCH' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5 uppercase">
                <Send size={16} className="text-blue-700" /> Step 2: Return Dispatch & Road Certificate Generation
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Initiate return dispatch of evidence parcel after lab examination back to Police Station Malkhana.
              </p>
            </div>

            <form onSubmit={handleSubmitReturnDispatch} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Destination Location *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                    value={dispatchData.destinationName}
                    onChange={(e) => setDispatchData({ ...dispatchData, destinationName: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Return Escort Officer Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Const. Vikram Singh"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                    value={dispatchData.escortName}
                    onChange={(e) => setDispatchData({ ...dispatchData, escortName: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Escort Officer Badge / ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. GJ-8812"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                    value={dispatchData.escortBadge}
                    onChange={(e) => setDispatchData({ ...dispatchData, escortBadge: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Road Certificate (RC) # (Auto-generated if empty)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. RC-2026-9901"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-mono font-bold"
                    value={dispatchData.roadCertificateNo}
                    onChange={(e) => setDispatchData({ ...dispatchData, roadCertificateNo: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  FSL Report Summary & Dispatch Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Chemical testing report #FSL-991 attached. Sealed parcel returned..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                  value={dispatchData.remarks}
                  onChange={(e) => setDispatchData({ ...dispatchData, remarks: e.target.value })}
                />
              </div>

              <div className="pt-2 flex justify-between items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVerificationStep('VERIFY_PIN')}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2.5 px-6 bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs rounded-xl transition-all shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Issuing RC...' : 'Confirm Return Dispatch & Issue RC'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── STEP 3: SUCCESS CONFIRMATION ── */}
        {verificationStep === 'SUCCESS' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {portalMode === 'RECEIPT' ? 'Inward Receipt Successfully Registered!' : 'Return Dispatch Issued Successfully!'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                The custody ledger node has been cryptographically signed and updated in the Gujarat Police database.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 font-mono space-y-1 inline-block text-left">
              <div>Tag: <strong>#{evidenceItem.evidenceTagId}</strong></div>
              <div>Official: {securityData.recipientName} ({securityData.badgeOrId})</div>
              <div>Facility: {securityData.facilityName}</div>
              <div>Status: {portalMode === 'RECEIPT' ? 'STORED AT FACILITY' : 'IN TRANSIT TO POLICE'}</div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
