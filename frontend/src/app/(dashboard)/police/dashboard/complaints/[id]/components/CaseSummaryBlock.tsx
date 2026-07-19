'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { ShieldAlert, Users, Link as LinkIcon, FileImage, ExternalLink, Calendar, MapPin, Scale } from 'lucide-react';

interface CaseSummaryBlockProps {
  complaint: any;
  evidence: any[];
}

export function CaseSummaryBlock({ complaint, evidence }: CaseSummaryBlockProps) {
  const getEvidenceIcon = (type: string) => {
    switch (type) {
      case 'bank_statement':
      case 'transaction_log': return '🏦';
      case 'kyc_document': return '🪪';
      case 'cdr': return '📞';
      case 'screenshot': return '🖼️';
      default: return '📄';
    }
  };

  // Mock extracted entities for UI if not available from AI yet
  const victims = [{ name: `${complaint.citizen?.firstName || ''} ${complaint.citizen?.lastName || ''}`, role: 'Complainant/Victim', detail: complaint.citizen?.phone || '' }];
  const suspects = [{ name: 'Unknown', role: 'Primary Suspect', detail: 'Pending Identification' }];

  const legalSections = complaint.legalSectionsHistory?.length > 0 && complaint.legalSectionsHistory[0].content 
    ? complaint.legalSectionsHistory[0].content 
    : 'No specific legal sections bound yet.';

  return (
    <div className="space-y-6">
      {/* Top Meta Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-extrabold text-neutral-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="text-red-600" size={22} />
            {complaint.complaintNumber}
          </h2>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-neutral-500 font-medium">
            <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(complaint.incidentDate).toLocaleDateString('en-IN')} {complaint.incidentTime || ''}</span>
            <span className="flex items-center gap-1"><MapPin size={14} /> {complaint.incidentPlace}</span>
            <span className="uppercase text-blue-700 font-bold bg-blue-50 px-2 rounded">{complaint.category?.replace('_', ' ')}</span>
          </div>
        </div>
        <div className="mt-4 md:mt-0 text-right">
          <p className="text-xs font-semibold text-neutral-400 uppercase">Assigned IO</p>
          <p className="text-sm font-bold text-neutral-800">{complaint.assignedIO?.officerName || 'Pending Assignment'}</p>
          {complaint.assignedIO?.badgeNumber && <p className="text-xs text-neutral-500">{complaint.assignedIO.badgeNumber}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Narrative */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 h-full shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-100 pb-2 mb-4">Case Narrative</h3>
            <p className="text-sm font-semibold text-neutral-800 mb-2">{complaint.shortDescription}</p>
            <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">{complaint.detailedDescription}</p>
          </Card>
        </div>

        {/* Entities & Legal */}
        <div className="space-y-6">
          <Card className="p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-100 pb-2 mb-4 flex items-center gap-2">
              <Scale size={15} /> Legal Sections
            </h3>
            {legalSections !== 'No specific legal sections bound yet.' ? (
              <div className="font-mono text-xs bg-red-50 text-red-900 border border-red-200 p-3 rounded-lg font-semibold">
                {legalSections}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 italic">{legalSections}</p>
            )}
          </Card>

          <Card className="p-5 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-800 border-b border-neutral-100 pb-2 mb-4 flex items-center gap-2">
              <Users size={15} /> Involved Entities
            </h3>
            <div className="space-y-3">
              {victims.map((v, i) => (
                <div key={`v-${i}`} className="flex justify-between items-center text-sm border-b border-neutral-50 pb-2">
                  <div>
                    <p className="font-semibold text-neutral-800">{v.name}</p>
                    <p className="text-[10px] uppercase font-bold text-green-600">{v.role}</p>
                  </div>
                  <span className="text-xs text-neutral-500">{v.detail}</span>
                </div>
              ))}
              {suspects.map((s, i) => (
                <div key={`s-${i}`} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="font-semibold text-neutral-800">{s.name}</p>
                    <p className="text-[10px] uppercase font-bold text-red-600">{s.role}</p>
                  </div>
                  <span className="text-xs text-neutral-500">{s.detail}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Initial Evidence Strip */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1 mb-3">
          <FileImage size={13} /> Attached Evidence ({evidence?.length || 0})
        </h3>
        {!evidence || evidence.length === 0 ? (
          <p className="text-xs text-neutral-400 italic">No evidence attached to this complaint.</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {evidence.map(ev => (
              <div key={ev._id} className="min-w-[180px] bg-white border border-neutral-200 rounded-lg p-3 shadow-sm flex flex-col gap-2 hover:border-blue-300 transition-colors cursor-pointer group">
                <div className="flex justify-between items-start">
                  <span className="text-2xl">{getEvidenceIcon(ev.type)}</span>
                  <ExternalLink size={12} className="text-neutral-300 group-hover:text-blue-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-neutral-800 truncate">{ev.title || 'Evidence Item'}</p>
                  <p className="text-[10px] text-neutral-500 uppercase mt-0.5">{ev.type?.replace(/_/g, ' ')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
