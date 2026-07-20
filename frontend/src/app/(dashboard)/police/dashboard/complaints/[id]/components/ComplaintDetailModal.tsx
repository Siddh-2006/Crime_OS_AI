'use client';

import React from 'react';
import { X, FileText, Calendar, MapPin, Tag } from 'lucide-react';

interface ComplaintDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  complaintData: any;
}

export default function ComplaintDetailModal({ isOpen, onClose, complaintData }: ComplaintDetailModalProps) {
  if (!isOpen || !complaintData) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
              <FileText className="text-blue-600" size={20} />
              Initial Complaint Record
            </h2>
            <p className="text-sm text-neutral-500">Citizen Submission Details</p>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-neutral-50/30">
          <div className="space-y-6">
            
            {/* Meta Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-xl border border-neutral-100 shadow-sm flex items-start gap-3">
                <Calendar className="text-neutral-400 mt-0.5" size={16} />
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Incident Date</p>
                  <p className="text-sm font-semibold text-neutral-800">
                    {complaintData.incident_date ? new Date(complaintData.incident_date).toLocaleDateString('en-IN') : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-neutral-100 shadow-sm flex items-start gap-3">
                <MapPin className="text-neutral-400 mt-0.5" size={16} />
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Location</p>
                  <p className="text-sm font-semibold text-neutral-800 line-clamp-2">
                    {complaintData.incident_place || 'Not specified'}
                  </p>
                </div>
              </div>
              <div className="bg-white p-4 rounded-xl border border-neutral-100 shadow-sm flex items-start gap-3">
                <Tag className="text-neutral-400 mt-0.5" size={16} />
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Category</p>
                  <p className="text-sm font-semibold text-neutral-800 uppercase">
                    {complaintData.category?.replace(/_/g, ' ') || 'Uncategorized'}
                  </p>
                </div>
              </div>
            </div>

            {/* Summaries */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50">
                <h3 className="text-sm font-bold text-neutral-800">Brief Summary</h3>
              </div>
              <div className="p-5 text-sm text-neutral-700 leading-relaxed font-medium">
                {complaintData.short_description || 'No brief summary provided.'}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50">
                <h3 className="text-sm font-bold text-neutral-800">Detailed Statement</h3>
              </div>
              <div className="p-5 text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
                {complaintData.detailed_description || 'No detailed statement provided.'}
              </div>
            </div>

            {/* Initial Evidence */}
            {complaintData.evidence_list && complaintData.evidence_list.length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-neutral-800">Initial Evidence Submitted</h3>
                  <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                    {complaintData.evidence_count} Items
                  </span>
                </div>
                <div className="p-5">
                  <ul className="space-y-3">
                    {complaintData.evidence_list.map((ev: any, idx: number) => (
                      <li key={idx} className="flex items-center gap-3 text-sm text-neutral-700 p-2 hover:bg-neutral-50 rounded-lg transition-colors border border-transparent hover:border-neutral-100">
                        <span className="text-xl">
                          {ev.type === 'image' ? '🖼️' : ev.type === 'video' ? '🎥' : ev.type === 'audio' ? '🔊' : '📄'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{ev.filename}</p>
                          <p className="text-xs text-neutral-400 capitalize">{ev.type}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
