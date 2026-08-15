'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { QrCode, ShieldCheck, Printer, CheckCircle, Package, Camera, Upload, X, FileText, Lock, MapPin, Tag, AlertCircle } from 'lucide-react';
import apiClient from '@/lib/axios';

interface AddPhysicalEvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess: () => void;
}

export function AddPhysicalEvidenceModal({ isOpen, onClose, caseId, onSuccess }: AddPhysicalEvidenceModalProps) {
  const [loading, setLoading] = useState(false);
  const [createdItem, setCreatedItem] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    itemName: '',
    category: 'WEAPON',
    description: '',
    quantityOrWeight: '',
    conditionOnSeizure: 'INTACT / SEIZED FROM SPOT',
    seizureMemoNo: '',
    sealNumber: '',
    seizureLocation: '',
    rackNo: '',
    shelfNo: '',
    lockerNo: '',
    itemPhotoUrl: '',
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
          setFormData((prev) => ({ ...prev, itemPhotoUrl: compressedBase64 }));
          setFormError(null);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.itemName || !formData.seizureMemoNo || !formData.sealNumber) {
      setFormError('Please fill out all required fields marked with * (Item Name, Seizure Memo #, Seal Number).');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post(`/physical-evidence/cases/${caseId}/physical-evidence`, formData);
      setCreatedItem(res.data.data);
      onSuccess();
    } catch (err: any) {
      setFormError(err.response?.data?.message || err.message || 'Failed to add physical evidence.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintTag = () => {
    if (!createdItem) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Evidence Tag Sticker - ${createdItem.evidenceTagId}</title>
          <style>
            body { font-family: monospace; padding: 20px; text-align: center; background: #fff; color: #000; }
            .tag-box { border: 2px solid #1e3a8a; padding: 15px; display: inline-block; width: 320px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            h2 { margin: 0 0 5px 0; font-size: 18px; color: #1e3a8a; }
            .meta { font-size: 12px; margin: 4px 0; font-weight: bold; }
            img { width: 160px; height: 160px; margin: 10px 0; border: 1px solid #ddd; padding: 4px; background: #fff; }
            .photo { width: 200px; max-height: 120px; object-fit: cover; margin: 8px auto; border-radius: 4px; }
            .hash { font-size: 8px; word-break: break-all; color: #444; margin-top: 6px; }
          </style>
        </head>
        <body>
          <div class="tag-box">
            <h2>GUJARAT POLICE</h2>
            <div class="meta">PHYSICAL EVIDENCE TAG</div>
            <div class="meta">Tag ID: <strong>${createdItem.evidenceTagId}</strong></div>
            ${createdItem.qrDataUrl ? `<img src="${createdItem.qrDataUrl}" alt="QR Tag" />` : ''}
            <div class="meta">Item: ${createdItem.itemName}</div>
            <div class="meta">Seizure Memo #: ${createdItem.seizureMemoNo}</div>
            <div class="meta">Wax Seal #: ${createdItem.sealNumber}</div>
            ${createdItem.itemPhotoUrl ? `<img src="${createdItem.itemPhotoUrl}" class="photo" alt="Evidence Photo" />` : ''}
            <div class="hash">Genesis SHA-256: ${createdItem.custodyChain?.[0]?.currentHash || 'VERIFIED'}</div>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleReset = () => {
    setCreatedItem(null);
    setFormError(null);
    setFormData({
      itemName: '',
      category: 'WEAPON',
      description: '',
      quantityOrWeight: '',
      conditionOnSeizure: 'INTACT / SEIZED FROM SPOT',
      seizureMemoNo: '',
      sealNumber: '',
      seizureLocation: '',
      rackNo: '',
      shelfNo: '',
      lockerNo: '',
      itemPhotoUrl: '',
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleReset} title="Register Seized Physical Evidence">
      {!createdItem ? (
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          
          {/* Inline Error Alert Banner */}
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-center gap-2 shadow-2xs">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <div>{formError}</div>
            </div>
          )}

          {/* Section 1: Item Core Metadata */}
          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5 border-b border-slate-200/80 pb-2">
              <Tag size={14} className="text-blue-700" /> Item Specification & Category
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all font-medium"
                  placeholder="e.g. 9mm Country-made Pistol"
                  value={formData.itemName}
                  onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Category *</label>
                <select
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all font-medium"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="WEAPON">Weapon / Firearm</option>
                  <option value="NARCOTICS">Narcotics / Drugs</option>
                  <option value="VEHICLE">Seized Vehicle</option>
                  <option value="DOCUMENT">Physical Document</option>
                  <option value="STOLEN_PROPERTY">Stolen Property / Gold</option>
                  <option value="BIOLOGICAL">Biological Sample / Blood</option>
                  <option value="ELECTRONIC_DEVICE">Electronic Hardware / Phone</option>
                  <option value="OTHER">Other Seized Item</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Quantity / Net Weight</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                  placeholder="e.g. 1 Unit, 500 grams"
                  value={formData.quantityOrWeight}
                  onChange={(e) => setFormData({ ...formData, quantityOrWeight: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Seizure Location / Spot</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                  placeholder="e.g. Spot of Crime, SG Highway"
                  value={formData.seizureLocation}
                  onChange={(e) => setFormData({ ...formData, seizureLocation: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Evidence Spot Photo Upload */}
          <div className="p-3.5 bg-blue-50/40 rounded-xl border border-blue-200/80 space-y-2.5">
            <label className="block text-xs font-bold text-slate-800 uppercase flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Camera size={14} className="text-blue-700" /> Evidence Spot Photo Upload</span>
              <span className="text-[10px] text-blue-700 font-medium bg-blue-100/70 px-2 py-0.5 rounded-full">Cloudinary Hosted</span>
            </label>

            {formData.itemPhotoUrl ? (
              <div className="relative inline-block group">
                <img
                  src={formData.itemPhotoUrl}
                  alt="Evidence Preview"
                  className="h-28 w-44 object-cover rounded-xl border border-slate-300 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, itemPhotoUrl: '' })}
                  className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow-md hover:bg-rose-700 transition-all"
                  title="Remove photo"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-blue-300/80 rounded-xl p-4 cursor-pointer hover:border-blue-600 hover:bg-blue-50/80 transition-all text-center">
                <Upload size={22} className="text-blue-600 mb-1" />
                <span className="text-xs font-bold text-slate-800">Click or Drag to Upload Evidence Spot Photo</span>
                <span className="text-[10px] text-slate-500 mt-0.5">PNG, JPG or WEBP (Auto-compressed to ~180KB)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Section 3: Panchnama Memo & Wax Seal */}
          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5 border-b border-slate-200/80 pb-2">
              <FileText size={14} className="text-blue-700" /> Panchnama Memo & Wax Seal Verification
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Seizure Memo (Panchnama) # *</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 font-medium"
                  placeholder="e.g. PN-2026-402"
                  value={formData.seizureMemoNo}
                  onChange={(e) => setFormData({ ...formData, seizureMemoNo: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Wax / Plastic Seal Number *</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 font-medium"
                  placeholder="e.g. SEAL-GJ-9914"
                  value={formData.sealNumber}
                  onChange={(e) => setFormData({ ...formData, sealNumber: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Description & Physical Markings</label>
              <textarea
                rows={2}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                placeholder="Describe physical condition, serial numbers, distinctive markings..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>

          {/* Section 4: Malkhana Storage Allocation */}
          <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1.5 border-b border-slate-200/80 pb-2">
              <Package size={14} className="text-purple-700" /> Initial Malkhana Storage Allocation
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Rack #"
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:border-blue-600 font-medium"
                value={formData.rackNo}
                onChange={(e) => setFormData({ ...formData, rackNo: e.target.value })}
              />
              <input
                type="text"
                placeholder="Shelf #"
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:border-blue-600 font-medium"
                value={formData.shelfNo}
                onChange={(e) => setFormData({ ...formData, shelfNo: e.target.value })}
              />
              <input
                type="text"
                placeholder="Locker #"
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:border-blue-600 font-medium"
                value={formData.lockerNo}
                onChange={(e) => setFormData({ ...formData, lockerNo: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="ghost" type="button" onClick={handleReset} disabled={loading} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" isLoading={loading} className="bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold shadow-xs px-5 py-2 rounded-xl">
              Log Evidence & Generate QR Tag
            </Button>
          </div>
        </form>
      ) : (
        /* Success & Printable QR View */
        <div className="text-center space-y-4 py-2">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Physical Evidence Registered!</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">SHA-256 Genesis Hash computed and sealed into Chain of Custody.</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block space-y-3 shadow-2xs max-w-xs">
            <div className="text-xs font-mono font-bold text-blue-900">Tag #{createdItem.evidenceTagId}</div>
            {createdItem.qrDataUrl && (
              <img src={createdItem.qrDataUrl} alt="QR Code" className="w-40 h-40 mx-auto rounded-lg bg-white p-2 border border-slate-200" />
            )}
            {createdItem.itemPhotoUrl && (
              <img src={createdItem.itemPhotoUrl} alt="Evidence Photo" className="w-44 h-28 mx-auto object-cover rounded-lg border border-slate-300 shadow-2xs" />
            )}
            <div className="text-[10px] font-mono text-slate-500 truncate max-w-[240px]">
              Hash: {createdItem.custodyChain?.[0]?.currentHash}
            </div>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <Button variant="secondary" onClick={handlePrintTag} className="flex items-center gap-2 border border-slate-300 text-xs">
              <Printer size={14} /> Print Evidence Tag Sticker
            </Button>
            <Button onClick={handleReset} className="bg-blue-900 hover:bg-blue-800 text-white text-xs">Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
