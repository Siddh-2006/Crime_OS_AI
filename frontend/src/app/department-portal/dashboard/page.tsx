'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Cookies from 'js-cookie';
import { Shield, FileText, CheckCircle2, Clock, LogOut, Send } from 'lucide-react';

export default function DepartmentDashboard() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptId, setDeptId] = useState('');
  
  // Modal state
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [responseContent, setResponseContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const router = useRouter();

  useEffect(() => {
    const token = Cookies.get('dept_token');
    const entity = Cookies.get('dept_entity_id');
    if (!token || !entity) {
      router.push('/department-portal');
      return;
    }
    setDeptId(entity);
    fetchRequests(entity);
  }, []);

  const fetchRequests = async (entity: string) => {
    try {
      const res = await axios.get(`http://localhost:5001/api/v1/department-portal/requests?department_entity_id=${encodeURIComponent(entity)}`);
      setRequests(res.data.data);
    } catch (err) {
      console.error('Failed to fetch requests', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Cookies.remove('dept_token');
    Cookies.remove('dept_entity_id');
    router.push('/department-portal');
  };

  const openModal = (req: any) => {
    setSelectedReq(req);
    setSelectedFile(null);
    // Generate a plausible mock response based on the request type
    let mockResponse = `CONFIDENTIAL RESPONSE\nDate: ${new Date().toLocaleDateString()}\nTo: Gujarat Police, Crime OS\n\n`;
    
    if (req.request_type === 'external_department') {
      mockResponse += `Subject: Data provision for Case ID ${req.case_id}\n\n`;
      mockResponse += `Pursuant to your request (${req.request_id}), please find the requested data below.\n\n`;
      mockResponse += `[MOCK DATA EXPORT]\n- Record Found: Yes\n- Associated Entity Match: True\n- Status: Active\n\n`;
      mockResponse += `The attachments and internal logs have been securely verified by our nodal team.\n`;
    } else {
      mockResponse += `Subject: Ground Verification Report for Case ID ${req.case_id}\n\n`;
      mockResponse += `Pursuant to the inter-station assignment (${req.request_id}), our officers visited the location.\n\n`;
      mockResponse += `[VERIFICATION DETAILS]\n- Address Verified: Yes\n- Suspect Present: No\n- Neighbors Interviewed: 2\n\n`;
      mockResponse += `Further surveillance has been requested.\n`;
    }
    
    setResponseContent(mockResponse);
  };

  const submitResponse = async () => {
    if (!selectedReq) return;
    setSubmitting(true);
    
    try {
      const payload: any = { response_content: responseContent };
      if (selectedFile) {
        payload.evidence = {
          title: selectedFile.name,
          type: 'document',
          description: 'User uploaded attachment',
          storage_ref: `mock-upload-url-${Date.now()}`,
          tags: ['attachment']
        };
      }
      await axios.post(`http://localhost:5001/api/v1/department-portal/requests/${selectedReq.request_id}/respond`, payload);
      
      // Refresh list
      setSelectedReq(null);
      fetchRequests(deptId);
    } catch (err) {
      console.error('Failed to submit response', err);
      alert('Error submitting response');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-blue-600 rounded-full flex items-center justify-center">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Department Portal</h1>
              <p className="text-sm text-slate-400">{deptId}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </header>

        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-white mb-2">Pending Requests</h2>
          <p className="text-slate-400">Official requests requiring your department's action.</p>
        </div>

        {requests.length === 0 ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">All Caught Up</h3>
            <p className="text-slate-400">There are no pending requests for your department.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {requests.map(req => (
              <div key={req.request_id} className="bg-slate-800 rounded-xl border border-slate-700 p-6 flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-blue-500/10 text-blue-400 text-xs px-2 py-1 rounded font-medium border border-blue-500/20">
                      {req.request_type === 'external_department' ? 'External Request' : 'Inter-Station'}
                    </span>
                    <span className="text-slate-400 text-sm flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">Case ID: {req.case_id}</h3>
                  <div className="bg-slate-900 rounded p-4 border border-slate-700 font-mono text-sm text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {req.draft_content}
                  </div>
                </div>
                <div className="flex items-end md:w-48">
                  <button 
                    onClick={() => openModal(req)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    Reply
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedReq && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-700">
              <h2 className="text-xl font-semibold text-white">Generate Response</h2>
              <p className="text-slate-400 text-sm mt-1">Replying to Request ID: {selectedReq.request_id}</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              <label className="block text-sm font-medium text-slate-300 mb-2">Response Content</label>
              <textarea
                value={responseContent}
                onChange={(e) => setResponseContent(e.target.value)}
                className="w-full h-48 bg-slate-900 border border-slate-700 rounded-lg p-4 text-white font-mono text-sm focus:outline-none focus:border-blue-500 mb-4"
              />
              
              <label className="block text-sm font-medium text-slate-300 mb-2">Attachment (Optional)</label>
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm"
              />

              <p className="text-xs text-slate-500 mt-4">
                This response will be ingested into the Crime OS backend as formal evidence, completing the associated Case Checklist step.
              </p>
            </div>
            
            <div className="p-6 border-t border-slate-700 bg-slate-800/50 flex justify-end gap-3">
              <button
                onClick={() => setSelectedReq(null)}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!responseContent) return;
                  setSubmitting(true);
                  try {
                    const res = await axios.post(`http://localhost:5001/api/v1/department-portal/requests/${selectedReq.request_id}/format-response`, {
                      response_content: responseContent
                    });
                    setResponseContent(res.data.data.formattedContent);
                  } catch (err) {
                    console.error('Failed to format response', err);
                    alert('Error formatting response');
                  } finally {
                    setSubmitting(false);
                  }
                }}
                disabled={submitting}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Formatting...' : 'Format this (AI)'}
              </button>
              <button
                onClick={submitResponse}
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit to Crime OS
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
