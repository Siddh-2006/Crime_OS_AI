'use client';

import React, { useState, useEffect } from 'react';
import { Download, FileText, RefreshCw, X } from 'lucide-react';
import { apiClient } from '../../../../../../../lib/apiClient';
import Button from '../../../../../../../components/ui/Button';

interface ChargeSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
}

export default function ChargeSheetModal({ isOpen, onClose, caseId }: ChargeSheetModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchChargeSheet = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get(`/investigation/${caseId}/chargesheet`);
      setData(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch charge sheet.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm('Are you sure you want to regenerate the Charge Sheet? This will invoke the AI model and create a new version.')) return;
    setRegenLoading(true);
    setError('');
    try {
      const res = await apiClient.post(`/investigation/${caseId}/chargesheet/regenerate`);
      await fetchChargeSheet();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to regenerate charge sheet.');
    } finally {
      setRegenLoading(false);
    }
  };

  const handleDownload = () => {
    // Navigate to the backend PDF endpoint which streams the PDF
    window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1'}/investigation/${caseId}/chargesheet/pdf`, '_blank');
  };

  useEffect(() => {
    if (isOpen) {
      fetchChargeSheet();
    }
  }, [isOpen, caseId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-neutral-50">
          <div className="flex items-center gap-2 text-neutral-800">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold">Final Report / Charge Sheet</h2>
            {data?.section1_filingInformation?.version && (
              <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full font-medium">
                v{data.section1_filingInformation.version}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-neutral-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-neutral-100">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-neutral-500 font-medium text-sm">Loading Charge Sheet...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200 text-center">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-6 max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-neutral-200 text-neutral-800">
              
              <div className="text-center mb-8 border-b pb-4">
                <h1 className="text-2xl font-black uppercase text-neutral-900 tracking-wider">FINAL REPORT</h1>
                <p className="text-sm font-medium text-neutral-500 mt-1 uppercase tracking-widest">Under Section 173 CrPC</p>
              </div>

              {/* 1. Filing Information */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3">1. Filing Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-semibold text-neutral-500">Charge Sheet No:</span> {data.section1_filingInformation.chargeSheetNumber}</div>
                  <div><span className="font-semibold text-neutral-500">FIR No:</span> {data.section1_filingInformation.firNumber}</div>
                  <div><span className="font-semibold text-neutral-500">Police Station:</span> {data.section1_filingInformation.policeStation}</div>
                  <div><span className="font-semibold text-neutral-500">Filing Date:</span> {data.section1_filingInformation.filingDate ? new Date(data.section1_filingInformation.filingDate).toLocaleDateString() : 'N/A'}</div>
                </div>
              </section>

              {/* 2. Case Particulars */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">2. Case Particulars</h3>
                <div className="text-sm space-y-2">
                  <p><span className="font-semibold text-neutral-500">Nature of Offence:</span> {data.section2_caseParticulars.natureOfOffence}</p>
                  <p><span className="font-semibold text-neutral-500">Date/Time:</span> {data.section2_caseParticulars.dateOfOccurrence ? new Date(data.section2_caseParticulars.dateOfOccurrence).toLocaleDateString() : ''} {data.section2_caseParticulars.timeOfOccurrence}</p>
                  <p><span className="font-semibold text-neutral-500">Place:</span> {data.section2_caseParticulars.placeOfOccurrence}</p>
                  <div>
                    <span className="font-semibold text-neutral-500">Brief Description:</span>
                    <p className="mt-1 text-justify text-neutral-700 bg-neutral-50 p-3 rounded">{data.section2_caseParticulars.briefCaseDescription}</p>
                  </div>
                </div>
              </section>

              {/* 7. Investigation Summary */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">7. Investigation Summary</h3>
                <div className="text-sm text-justify text-neutral-700 whitespace-pre-wrap">{data.section7_investigationSummary || 'No summary available.'}</div>
              </section>

              {/* 11. Investigation Findings */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">11. Investigation Findings</h3>
                <div className="text-sm text-justify text-neutral-700 whitespace-pre-wrap">{data.section11_investigationFindings || 'No findings available.'}</div>
              </section>

              {/* 13. Final Report / Prayer */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">13. Final Report / Prayer</h3>
                <div className="text-sm text-justify text-neutral-700 whitespace-pre-wrap">{data.section13_finalReport || 'No final report available.'}</div>
              </section>

              {/* 14. Annexures */}
              <section>
                <h3 className="bg-neutral-100 p-2 font-bold uppercase text-xs tracking-wider border-l-4 border-neutral-900 mb-3 mt-6">14. Annexures</h3>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {data.section14_annexures?.map((annex: any, idx: number) => (
                    <li key={idx}><span className="font-semibold">{annex.type}:</span> {annex.title}</li>
                  ))}
                </ul>
              </section>

            </div>
          ) : null}
        </div>

        <div className="p-4 border-t bg-white flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={loading || regenLoading}>Close</Button>
          <Button
            variant="secondary"
            leftIcon={<RefreshCw size={16} className={regenLoading ? "animate-spin" : ""} />}
            onClick={handleRegenerate}
            disabled={loading || regenLoading}
            isLoading={regenLoading}
          >
            Regenerate
          </Button>
          <Button
            leftIcon={<Download size={16} />}
            onClick={handleDownload}
            disabled={loading || regenLoading || !data}
          >
            Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
