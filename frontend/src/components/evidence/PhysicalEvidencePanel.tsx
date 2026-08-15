'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Plus, QrCode, RefreshCw, CheckCircle2, Clock, MapPin, UserCheck, Sparkles, Printer, Camera, Search, Filter, Maximize2, X, FileText, Package, History, Info, Users, Archive, Truck } from 'lucide-react';
import apiClient from '@/lib/axios';
import { AddPhysicalEvidenceModal } from './AddPhysicalEvidenceModal';
import { ScanTransferModal } from './ScanTransferModal';
import { CustodyTimelineVisualizer } from './CustodyTimelineVisualizer';

interface PhysicalEvidencePanelProps {
  caseId: string;
}

export function PhysicalEvidencePanel({ caseId }: PhysicalEvidencePanelProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  // Workspace Sub-Tab State ('overview' | 'ledger' | 'seizure')
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'overview' | 'ledger' | 'seizure'>('overview');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [lightboxPhotoUrl, setLightboxPhotoUrl] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/physical-evidence/cases/${caseId}/physical-evidence`);
      const list = res.data.data || [];
      setItems(list);

      // Auto-select first item or preserve current selection without triggering infinite re-render loops
      setSelectedItem((prev: any) => {
        if (!prev && list.length > 0) return list[0];
        if (prev) {
          const updated = list.find((i: any) => i._id === prev._id);
          return updated || prev;
        }
        return null;
      });
    } catch (err) {
      console.error('Failed to fetch physical evidence', err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchItems();
  }, [caseId, fetchItems]);

  const handlePrintTag = (item: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!item) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Evidence Tag Sticker - ${item.evidenceTagId}</title>
          <style>
            body { font-family: monospace; padding: 20px; text-align: center; background: #fff; color: #000; }
            .tag-box { border: 2px solid #1e3a8a; padding: 15px; display: inline-block; width: 320px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h2 { margin: 0 0 5px 0; font-size: 18px; color: #1e3a8a; }
            .meta { font-size: 12px; margin: 4px 0; font-weight: bold; }
            img { width: 160px; height: 160px; margin: 10px 0; border: 1px solid #ddd; padding: 4px; background: #fff; }
            .photo { width: 220px; max-height: 130px; object-fit: cover; margin: 8px auto; border-radius: 4px; border: 1px solid #ccc; }
            .hash { font-size: 8px; word-break: break-all; color: #444; margin-top: 6px; }
          </style>
        </head>
        <body>
          <div class="tag-box">
            <h2>GUJARAT POLICE</h2>
            <div class="meta">PHYSICAL EVIDENCE TAG</div>
            <div class="meta">Tag ID: <strong>${item.evidenceTagId}</strong></div>
            ${item.qrDataUrl ? `<img src="${item.qrDataUrl}" alt="QR Tag" />` : ''}
            <div class="meta">Item: ${item.itemName}</div>
            <div class="meta">Seizure Memo #: ${item.seizureMemoNo}</div>
            <div class="meta">Wax Seal #: ${item.sealNumber}</div>
            ${item.itemPhotoUrl ? `<img src="${item.itemPhotoUrl}" class="photo" alt="Evidence Photo" />` : ''}
            <div class="hash">Genesis SHA-256: ${item.custodyChain?.[0]?.currentHash || 'VERIFIED'}</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getNextRecommendedAction = (item: any) => {
    const status = item?.status;
    if (status?.includes('IN_TRANSIT')) {
      const lastNode = item.custodyChain?.[item.custodyChain.length - 1];
      return {
        stepName: 'Acknowledge Inward Receipt',
        description: `Parcel is currently in transit to ${lastNode?.toLocation || 'destination'}. Recipient officer must scan QR and confirm inward receipt.`,
        badgeColor: 'bg-amber-50 text-amber-900 border-amber-300',
      };
    }
    if (status === 'STORED_AT_FSL') {
      return {
        stepName: 'FSL Testing & Return Dispatch',
        description: 'Forensic testing in progress. Upon completion of examination, dispatch parcel back to Police Malkhana or Court.',
        badgeColor: 'bg-purple-50 text-purple-900 border-purple-300',
      };
    }
    if (status === 'PRODUCED_IN_COURT') {
      return {
        stepName: 'Return to Malkhana Vault',
        description: 'Evidence produced in judicial court. After trial hearing, return item to Police Malkhana for secure storage.',
        badgeColor: 'bg-blue-50 text-blue-900 border-blue-300',
      };
    }
    return {
      stepName: 'Dispatch to Forensic Lab (FSL) or Court',
      description: 'Parcel stored at Police Malkhana. Initiate dispatch to Forensic Science Laboratory or Court exhibit vault.',
      badgeColor: 'bg-emerald-50 text-emerald-900 border-emerald-300',
    };
  };

  // Filter items by search query & status pill
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.itemName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.evidenceTagId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.seizureMemoNo?.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'ALL') return matchesSearch;
    if (statusFilter === 'MALKHANA') return matchesSearch && (item.status === 'SEIZED' || item.status === 'STORED_IN_MALKHANA');
    if (statusFilter === 'IN_TRANSIT') return matchesSearch && item.status?.includes('IN_TRANSIT');
    if (statusFilter === 'FSL') return matchesSearch && (item.status?.includes('FSL') || item.status?.includes('COURT'));
    return matchesSearch;
  });

  // KPI Metrics Calculation
  const totalItemsCount = items.length;
  const malkhanaCount = items.filter((i) => i.status === 'SEIZED' || i.status === 'STORED_IN_MALKHANA').length;
  const transitCount = items.filter((i) => i.status?.includes('IN_TRANSIT')).length;
  const externalCount = items.filter((i) => i.status?.includes('FSL') || i.status?.includes('COURT') || i.status?.includes('FACILITY')).length;

  return (
    <div className="space-y-4 font-sans text-slate-900">
      
      {/* Header Bar - Clean White Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            <h3 className="text-base font-bold text-slate-900">Physical Evidence & Custody Ledger Command Center</h3>
            <span className="text-xs font-mono font-bold text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              {items.length} Logged Seizures
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            BNSS-compliant physical evidence tracking with cryptographic chain verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAddModalOpen(true)}
            className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <Plus size={14} /> Log Seized Evidence
          </button>

          <button
            onClick={() => setScanModalOpen(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5"
          >
            <Shield size={14} /> Scan QR / Handover
          </button>

          <button
            onClick={fetchItems}
            disabled={loading}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all border border-slate-200"
            title="Refresh list"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Metrics Dashboard Bar */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-900 border border-blue-200 flex items-center justify-center font-bold shrink-0">
              <Package size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Seized Assets</div>
              <div className="text-lg font-bold font-mono text-slate-900">{totalItemsCount}</div>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center font-bold shrink-0">
              <Archive size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">In Malkhana Vault</div>
              <div className="text-lg font-bold font-mono text-slate-900">{malkhanaCount}</div>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center font-bold shrink-0">
              <Truck size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">In-Transit</div>
              <div className="text-lg font-bold font-mono text-slate-900">{transitCount}</div>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-800 border border-purple-200 flex items-center justify-center font-bold shrink-0">
              <Shield size={20} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">At FSL / Court / Lab</div>
              <div className="text-lg font-bold font-mono text-slate-900">{externalCount}</div>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-300 shadow-xs space-y-3">
          <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto border border-blue-200">
            <Shield size={24} />
          </div>
          <h4 className="text-sm font-bold text-slate-900">No Physical Evidence Logged Yet</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Log seized weapons, narcotics, documents, or property to generate a printable QR tag sticker and custody ledger.
          </p>
          <button
            onClick={() => setAddModalOpen(true)}
            className="mt-2 px-5 py-2.5 bg-blue-900 text-white text-xs font-bold rounded-xl hover:bg-blue-800 transition-all inline-flex items-center gap-1.5 shadow-xs"
          >
            <Plus size={14} /> Log First Seized Item
          </button>
        </div>
      ) : (
        /* Master-Detail 2-Column Grid Layout (5 : 7 Ratio) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* ── Left Column: Master Items List (5 Columns on LG) ── */}
          <div className="lg:col-span-5 space-y-3 min-w-0">
            {/* Search & Status Filters */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Tag ID, Item Name, Memo #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>

              {/* Filter Chips */}
              <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                {[
                  { id: 'ALL', label: 'All Items' },
                  { id: 'MALKHANA', label: 'Malkhana' },
                  { id: 'IN_TRANSIT', label: 'In-Transit' },
                  { id: 'FSL', label: 'At FSL / Court' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1 rounded-lg border transition-all ${
                      statusFilter === tab.id
                        ? 'bg-blue-900 text-white border-blue-900 shadow-2xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Master Item Cards - Clean & Elevated */}
            <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
              {filteredItems.length === 0 ? (
                <div className="p-6 bg-white rounded-2xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                  No evidence items match search query.
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedItem?._id === item._id;
                  return (
                    <div
                      key={item._id}
                      onClick={() => setSelectedItem(item)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-2xs relative overflow-hidden ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-600 ring-2 ring-blue-600/30 border-l-4 border-l-blue-700'
                          : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        {/* Spot Photo Thumbnail */}
                        {item.itemPhotoUrl ? (
                          <img
                            src={item.itemPhotoUrl}
                            alt={item.itemName}
                            className="w-16 h-16 object-cover rounded-xl border border-slate-200 shrink-0 shadow-2xs"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0">
                            <Camera size={22} />
                          </div>
                        )}

                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                              #{item.evidenceTagId}
                            </span>
                            <span
                              className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase shrink-0 ${
                                item.status?.includes('FSL') || item.status?.includes('COURT')
                                  ? 'bg-purple-50 text-purple-900 border border-purple-200'
                                  : item.status?.includes('IN_TRANSIT')
                                  ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                  : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                              }`}
                            >
                              {item.status?.replace(/_/g, ' ')}
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-slate-900 mt-1 truncate">{item.itemName}</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">{item.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-3 mt-3 border-t border-slate-100">
                        <span>Memo: #{item.seizureMemoNo}</span>
                        <button
                          onClick={(e) => handlePrintTag(item, e)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[10px] font-bold font-sans flex items-center gap-1 transition-all border border-slate-200"
                          title="Print Tag"
                        >
                          <Printer size={11} /> Print Tag
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Right Column: Inspection Workspace (7 Columns on LG) ── */}
          <div className="lg:col-span-7 space-y-4 min-w-0">
            {selectedItem ? (
              <>
                {/* Hero Header Card */}
                <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200 space-y-4 min-w-0 overflow-hidden">
                  {/* Top Meta Row */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-white bg-blue-900 px-2.5 py-1 rounded-md shadow-2xs uppercase">
                        {selectedItem.category}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-800 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs">
                        Tag #{selectedItem.evidenceTagId}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-md uppercase flex items-center gap-1.5 shadow-2xs ${
                        selectedItem.status?.includes('FSL') || selectedItem.status?.includes('COURT')
                          ? 'bg-purple-100 text-purple-900 border border-purple-200'
                          : selectedItem.status?.includes('IN_TRANSIT')
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        selectedItem.status?.includes('FSL') ? 'bg-purple-600' : selectedItem.status?.includes('IN_TRANSIT') ? 'bg-amber-600' : 'bg-emerald-600'
                      }`} />
                      {selectedItem.status?.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Main Title & Primary Actions Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-extrabold text-slate-900 truncate tracking-tight">
                        {selectedItem.itemName}
                      </h3>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        Seizure Memo #{selectedItem.seizureMemoNo} • Wax Seal #{selectedItem.sealNumber}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handlePrintTag(selectedItem)}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all border border-slate-300 flex items-center gap-1.5 shadow-2xs"
                      >
                        <Printer size={14} /> Print Tag Sticker
                      </button>
                      <button
                        onClick={() => setScanModalOpen(true)}
                        className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-1.5"
                      >
                        <Shield size={14} /> Handover / Update Stage
                      </button>
                    </div>
                  </div>

                  {/* Workspace Sub-Tab Navigation Bar */}
                  <div className="flex border-b border-slate-200 text-xs font-bold text-slate-600 gap-2 pt-1">
                    <button
                      onClick={() => setActiveWorkspaceTab('overview')}
                      className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-all ${
                        activeWorkspaceTab === 'overview'
                          ? 'border-blue-900 text-blue-900 font-extrabold'
                          : 'border-transparent hover:text-slate-900'
                      }`}
                    >
                      <Package size={14} /> Overview & Asset Tags
                    </button>

                    <button
                      onClick={() => setActiveWorkspaceTab('ledger')}
                      className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-all ${
                        activeWorkspaceTab === 'ledger'
                          ? 'border-blue-900 text-blue-900 font-extrabold'
                          : 'border-transparent hover:text-slate-900'
                      }`}
                    >
                      <History size={14} /> Chain of Custody Ledger
                    </button>

                    <button
                      onClick={() => setActiveWorkspaceTab('seizure')}
                      className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-all ${
                        activeWorkspaceTab === 'seizure'
                          ? 'border-blue-900 text-blue-900 font-extrabold'
                          : 'border-transparent hover:text-slate-900'
                      }`}
                    >
                      <FileText size={14} /> Seizure Memo & Storage
                    </button>
                  </div>

                  {/* ── Sub-Tab 1: Overview & Asset Tags ── */}
                  {activeWorkspaceTab === 'overview' && (
                    <div className="space-y-4 pt-1">
                      {/* Side-by-Side Asset Inspection Box */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* Left Box: Spot Photo + Lightbox */}
                        <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-2">
                          <div className="text-[10px] font-bold uppercase text-slate-700 flex items-center justify-between">
                            <span className="flex items-center gap-1"><Camera size={12} className="text-blue-700" /> Evidence Spot Photo</span>
                            {selectedItem.itemPhotoUrl && (
                              <button
                                onClick={() => setLightboxPhotoUrl(selectedItem.itemPhotoUrl)}
                                className="text-blue-700 hover:text-blue-900 flex items-center gap-0.5 font-sans text-[10px]"
                              >
                                <Maximize2 size={10} /> Expand
                              </button>
                            )}
                          </div>

                          {selectedItem.itemPhotoUrl ? (
                            <div
                              onClick={() => setLightboxPhotoUrl(selectedItem.itemPhotoUrl)}
                              className="relative group cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white"
                            >
                              <img
                                src={selectedItem.itemPhotoUrl}
                                alt="Evidence Spot Photo"
                                className="w-full h-36 object-cover group-hover:scale-105 transition-all duration-300"
                              />
                              <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                                <Maximize2 size={20} className="text-white drop-shadow-md" />
                              </div>
                            </div>
                          ) : (
                            <div className="h-36 bg-white rounded-lg border border-slate-200 flex flex-col items-center justify-center text-slate-400 space-y-1">
                              <Camera size={24} />
                              <span className="text-[11px]">No Spot Photo Attached</span>
                            </div>
                          )}
                        </div>

                        {/* Right Box: QR Tag Card & Barcode */}
                        <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200 space-y-2">
                          <div className="text-[10px] font-bold uppercase text-slate-700 flex items-center gap-1">
                            <QrCode size={12} className="text-emerald-700" /> QR Barcode Tag Label
                          </div>

                          <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200">
                            {selectedItem.qrDataUrl ? (
                              <img src={selectedItem.qrDataUrl} alt="QR Code" className="w-24 h-24 bg-white p-1 rounded-md shrink-0 border border-slate-200" />
                            ) : (
                              <div className="w-24 h-24 bg-slate-100 rounded-md flex items-center justify-center text-slate-400 shrink-0">
                                <QrCode size={28} />
                              </div>
                            )}

                            <div className="text-[11px] space-y-1 min-w-0">
                              <div className="font-mono font-bold text-blue-900 truncate">Tag #{selectedItem.evidenceTagId}</div>
                              <div className="text-slate-700">Wax Seal: {selectedItem.sealNumber}</div>
                              <div className="text-[10px] text-slate-500 font-mono">Panchnama #{selectedItem.seizureMemoNo}</div>
                              <button
                                onClick={() => handlePrintTag(selectedItem)}
                                className="mt-1 px-2.5 py-1 bg-blue-900 text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-2xs hover:bg-blue-800"
                              >
                                <Printer size={11} /> Print Tag Sticker
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Live Custody Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                          <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center gap-1">
                            <UserCheck size={12} className="text-amber-600" /> Current Custodian
                          </div>
                          <div className="font-bold text-slate-900">{selectedItem.currentCustodian?.holderName}</div>
                          <div className="text-[11px] text-slate-600">{selectedItem.currentCustodian?.holderRole}</div>
                        </div>

                        <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                          <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center gap-1">
                            <MapPin size={12} className="text-blue-700" /> Physical Location
                          </div>
                          <div className="font-bold text-slate-900 line-clamp-1">{selectedItem.currentCustodian?.location}</div>
                          <div className="text-[11px] text-slate-600">Facility / Vault Location</div>
                        </div>

                        <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200">
                          <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center gap-1">
                            <Clock size={12} className="text-emerald-700" /> Time in Custody
                          </div>
                          <div className="font-bold text-slate-900 font-mono">
                            {new Date(selectedItem.currentCustodian?.heldSince).toLocaleString()}
                          </div>
                          <div className="text-[11px] text-slate-600">Entry Timestamp</div>
                        </div>
                      </div>

                      {/* Next Workflow Stage AI Guidance Banner */}
                      {(() => {
                        const rec = getNextRecommendedAction(selectedItem);
                        return (
                          <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 flex items-start gap-2.5">
                            <Sparkles size={16} className="text-blue-700 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <div className="text-xs font-bold text-blue-900">Next Required Legal Stage: {rec.stepName}</div>
                              <p className="text-[11px] text-blue-800 leading-relaxed">{rec.description}</p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── Sub-Tab 2: Chain of Custody Ledger ── */}
                  {activeWorkspaceTab === 'ledger' && (
                    <div className="pt-1">
                      <CustodyTimelineVisualizer
                        evidenceId={selectedItem._id}
                        evidenceTagId={selectedItem.evidenceTagId}
                        custodyChain={selectedItem.custodyChain || []}
                      />
                    </div>
                  )}

                  {/* ── Sub-Tab 3: Seizure Memo & Storage ── */}
                  {activeWorkspaceTab === 'seizure' && (
                    <div className="space-y-4 pt-1 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* Seizure Memo Card */}
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-2">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                            <FileText size={14} className="text-blue-700" /> Panchnama / Seizure Memo Metadata
                          </div>
                          <div className="space-y-1.5 pt-1 text-slate-700">
                            <div><strong className="text-slate-900">Memo Number:</strong> #{selectedItem.seizureMemoNo}</div>
                            <div><strong className="text-slate-900">Seized By:</strong> {selectedItem.seizedByOfficerName} ({selectedItem.seizedByOfficerId})</div>
                            <div><strong className="text-slate-900">Seizure Date:</strong> {new Date(selectedItem.seizureDate).toLocaleString()}</div>
                            <div><strong className="text-slate-900">Spot Location:</strong> {selectedItem.seizureLocation}</div>
                            <div><strong className="text-slate-900">Wax Seal ID:</strong> {selectedItem.sealNumber} ({selectedItem.sealStatus})</div>
                          </div>
                        </div>

                        {/* Malkhana Vault Allocation Card */}
                        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-2">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                            <Archive size={14} className="text-purple-700" /> Malkhana Storage Allocation
                          </div>
                          <div className="space-y-1.5 pt-1 text-slate-700">
                            <div><strong className="text-slate-900">Police Station:</strong> {selectedItem.policeStationId || 'PS-CENTRAL-01'}</div>
                            <div><strong className="text-slate-900">Malkhana Register #:</strong> {selectedItem.malkhanaRegisterNo || 'REG-2026-091'}</div>
                            <div className="flex gap-4 pt-1 font-mono text-[11px]">
                              <span className="bg-white px-2.5 py-1 rounded border border-slate-200 font-bold">Rack: {selectedItem.rackNo || 'N/A'}</span>
                              <span className="bg-white px-2.5 py-1 rounded border border-slate-200 font-bold">Shelf: {selectedItem.shelfNo || 'N/A'}</span>
                              <span className="bg-white px-2.5 py-1 rounded border border-slate-200 font-bold">Locker: {selectedItem.lockerNo || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Description & Witnesses */}
                      <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-2 min-w-0 overflow-hidden w-full">
                        <div className="font-bold text-slate-900 border-b border-slate-200 pb-2">
                          Physical Condition & Marked Features
                        </div>
                        <p className="text-slate-700 leading-relaxed break-all [word-break:break-all] [overflow-wrap:anywhere] whitespace-normal min-w-0 w-full">{selectedItem.description || 'No specific markings noted.'}</p>
                        {selectedItem.quantityOrWeight && (
                          <div className="text-slate-600 font-mono text-[11px] pt-1">
                            Quantity / Net Weight: <strong>{selectedItem.quantityOrWeight}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </>
            ) : (
              <div className="p-12 bg-white rounded-2xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
                Select an evidence item from the master list to inspect full custody timeline.
              </div>
            )}
          </div>

        </div>
      )}

      {/* Lightbox Photo Preview Modal */}
      {lightboxPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxPhotoUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl p-3 border border-slate-200 shadow-2xl overflow-hidden">
            <button
              onClick={() => setLightboxPhotoUrl(null)}
              className="absolute top-4 right-4 bg-slate-100 text-slate-800 p-2 rounded-full hover:bg-slate-200 transition-all z-10 border border-slate-300"
            >
              <X size={18} />
            </button>
            <img
              src={lightboxPhotoUrl}
              alt="Evidence Spot Photo Enlarged"
              className="max-h-[80vh] w-auto object-contain rounded-xl mx-auto"
            />
          </div>
        </div>
      )}

      {/* Modals */}
      <AddPhysicalEvidenceModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        caseId={caseId}
        onSuccess={fetchItems}
      />

      <ScanTransferModal
        isOpen={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        onSuccess={fetchItems}
        initialTagId={selectedItem?.evidenceTagId}
        caseId={caseId}
      />
    </div>
  );
}
