'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ShieldAlert,
  UploadCloud,
  CheckCircle,
  AlertCircle,
  FileText,
  X
} from 'lucide-react';

interface CitizenRequest {
  caseId: string;
  content: string;
  status: string;
  expiresAt: string;
}

export default function CitizenResponsePage() {
  const { token } = useParams();
  
  const [request, setRequest] = useState<CitizenRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchRequest() {
      try {
        const res = await fetch(`http://localhost:5001/api/v1/citizen-request/${token}`);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.message || 'Failed to load request');
        }
        
        setRequest(data.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    if (token) {
      fetchRequest();
    }
  }, [token]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && files.length === 0) {
      setError('Please provide a message or upload at least one file.');
      return;
    }
    
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      if (message.trim()) {
        formData.append('message', message);
      }
      files.forEach(file => {
        formData.append('files', file);
      });

      const res = await fetch(`http://localhost:5001/api/v1/citizen-request/${token}/response`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit response');
      }
      
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden border border-slate-100">
          <div className="bg-red-50 p-6 border-b border-red-100 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-red-900 mb-2">Link Invalid or Expired</h2>
            <p className="text-red-700">{error}</p>
          </div>
          <div className="p-6 text-center">
            <p className="text-slate-600 mb-4">
              If you believe this is an error, please contact your Investigating Officer.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden border border-slate-100">
          <div className="bg-emerald-50 p-6 border-b border-emerald-100 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-emerald-900 mb-2">Information Submitted Successfully</h2>
            <p className="text-emerald-700">Thank you for providing the requested information.</p>
          </div>
          <div className="p-6 text-center">
            <p className="text-slate-600">
              The Investigating Officer for Case <strong>{request?.caseId}</strong> has been notified.
              You may now close this window.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl w-full mx-auto">
        <div className="text-center mb-8">
          <ShieldAlert className="h-12 w-12 text-blue-900 mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold text-slate-900">Gujarat Police</h1>
          <p className="text-slate-500 mt-2">Official Information Request Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
          {/* Header */}
          <div className="bg-blue-900 p-6 text-white">
            <div className="flex justify-between items-center mb-2">
              <span className="text-blue-200 text-sm font-medium uppercase tracking-wider">Case Request</span>
              <span className="bg-blue-800 text-blue-100 text-xs px-2 py-1 rounded border border-blue-700 font-mono">
                {request?.caseId}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-white mt-1">Information Required</h2>
          </div>

          {/* Body */}
          <div className="p-6 sm:p-8">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-8">
              <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Message from Investigating Officer
              </h3>
              <p className="text-blue-800 text-lg leading-relaxed font-medium">
                "{request?.content}"
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-md">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="message" className="block text-sm font-semibold text-slate-700 mb-2">
                  Your Response (Optional)
                </label>
                <textarea
                  id="message"
                  rows={4}
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 p-3 border"
                  placeholder="Type your message here..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Upload Evidence/Documents (Optional)
                </label>
                
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="space-y-1 text-center">
                    <UploadCloud className="mx-auto h-12 w-12 text-slate-400" />
                    <div className="flex text-sm text-slate-600 justify-center">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer bg-transparent rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                      >
                        <span>Select files</span>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple onChange={handleFileChange} />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      Images, Videos, PDFs up to 50MB
                    </p>
                  </div>
                </div>

                {files.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {files.map((file, idx) => (
                      <li key={idx} className="flex items-center justify-between py-2 pl-3 pr-4 text-sm bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="flex items-center flex-1 w-0">
                          <FileText className="flex-shrink-0 h-5 w-5 text-slate-400" />
                          <span className="ml-2 flex-1 w-0 truncate text-slate-700 font-medium">{file.name}</span>
                        </div>
                        <div className="ml-4 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="font-medium text-red-600 hover:text-red-500 p-1 bg-red-50 rounded"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200">
                <button
                  type="submit"
                  disabled={submitting || (!message.trim() && files.length === 0)}
                  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Submitting...' : 'Submit to Police'}
                </button>
              </div>
            </form>
          </div>
          <div className="bg-slate-50 p-4 border-t border-slate-200 text-center text-xs text-slate-500">
            Confidential & Secure • Gujarat Police Information System
          </div>
        </div>
      </div>
    </div>
  );
}
