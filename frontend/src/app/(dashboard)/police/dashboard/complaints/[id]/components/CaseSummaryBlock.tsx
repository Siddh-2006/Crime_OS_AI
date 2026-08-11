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

  // Extracted entities
  const victims = [{ name: `${complaint.citizen?.firstName || ''} ${complaint.citizen?.lastName || ''}`, role: 'Complainant/Victim', detail: complaint.citizen?.phone || '' }];
  const suspects = [{ name: 'Unknown', role: 'Primary Suspect', detail: 'Pending Identification' }];

  const legalSections = complaint.legalSectionsHistory?.length > 0 && complaint.legalSectionsHistory[0].content 
    ? complaint.legalSectionsHistory[0].content 
    : 'No specific legal sections bound yet.';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Meta Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface border border-border rounded-2xl p-5 shadow-card glass">
        <div>
          <h2 className="text-xl font-heading font-extrabold text-text-primary tracking-tight flex items-center gap-2">
            <ShieldAlert className="text-semantic-critical" size={22} />
            {complaint.complaintNumber}
          </h2>
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-text-secondary font-medium">
            <span className="flex items-center gap-1.5"><Calendar size={14} className="text-text-muted" /> {new Date(complaint.incidentDate).toLocaleDateString('en-IN')} {complaint.incidentTime || ''}</span>
            <span className="flex items-center gap-1.5"><MapPin size={14} className="text-text-muted" /> {complaint.incidentPlace}</span>
            <span className="uppercase text-brand-primary font-bold bg-brand-primary/10 border border-brand-primary/20 px-2.5 py-0.5 rounded-lg text-xs tracking-wider">{complaint.category?.replace('_', ' ')}</span>
          </div>
        </div>
        <div className="mt-4 md:mt-0 text-left md:text-right">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Assigned IO</p>
          <p className="text-sm font-bold text-text-primary mt-0.5">{complaint.assignedIO?.officerName || 'Pending Assignment'}</p>
          {complaint.assignedIO?.badgeNumber && <p className="text-xs text-text-secondary font-mono">{complaint.assignedIO.badgeNumber}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Narrative */}
        <div className="lg:col-span-2 space-y-6">
          <Card glass className="h-full">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border pb-3 mb-4 font-heading">Case Narrative</h3>
            <p className="text-base font-bold text-text-primary mb-3 leading-snug">{complaint.shortDescription}</p>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{complaint.detailedDescription}</p>
          </Card>
        </div>

        {/* Entities & Legal */}
        <div className="space-y-6">
          <Card glass>
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border pb-3 mb-4 flex items-center gap-2 font-heading">
              <Scale size={15} className="text-brand-primary" /> Legal Sections
            </h3>
            {legalSections !== 'No specific legal sections bound yet.' ? (
              <div className="font-mono text-xs bg-semantic-critical/10 text-semantic-critical border border-semantic-critical/20 p-3 rounded-xl font-semibold">
                {legalSections}
              </div>
            ) : (
              <p className="text-xs text-text-muted italic">{legalSections}</p>
            )}
          </Card>

          <Card glass>
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary border-b border-border pb-3 mb-4 flex items-center gap-2 font-heading">
              <Users size={15} className="text-brand-primary" /> Involved Entities
            </h3>
            <div className="space-y-3">
              {victims.map((v, i) => (
                <div key={`v-${i}`} className="flex justify-between items-center text-sm border-b border-border/50 pb-2">
                  <div>
                    <p className="font-semibold text-text-primary">{v.name}</p>
                    <p className="text-[10px] uppercase font-bold text-semantic-success">{v.role}</p>
                  </div>
                  <span className="text-xs text-text-secondary font-mono">{v.detail}</span>
                </div>
              ))}
              {suspects.map((s, i) => (
                <div key={`s-${i}`} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="font-semibold text-text-primary">{s.name}</p>
                    <p className="text-[10px] uppercase font-bold text-semantic-critical">{s.role}</p>
                  </div>
                  <span className="text-xs text-text-muted font-mono">{s.detail}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
