'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Cookies from 'js-cookie';
import { Shield, FileText, CheckCircle2, Clock, LogOut, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';

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
    return <Loader fullPage label="Loading Department Dashboard..." />;
  }

  return (
    <div className="min-h-screen bg-background text-text-primary p-6 lg:p-8 animate-fade-in relative z-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex justify-between items-center bg-surface p-5 rounded-2xl border border-border shadow-card glass">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-brand-primary/10 border border-brand-primary/20 rounded-2xl flex items-center justify-center text-brand-primary shadow-glow-sm">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-heading font-extrabold text-text-primary">Department Portal</h1>
              <p className="text-xs font-mono text-text-secondary mt-0.5">{deptId}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleLogout}
            leftIcon={<LogOut className="h-4 w-4" />}
          >
            Logout
          </Button>
        </header>

        <div>
          <h2 className="text-2xl font-heading font-bold text-text-primary">Pending Requests</h2>
          <p className="text-sm text-text-secondary mt-0.5 font-medium">Official requests requiring your department's action.</p>
        </div>

        {requests.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-border p-12 text-center shadow-card glass">
            <CheckCircle2 className="h-12 w-12 text-semantic-success mx-auto mb-4" />
            <h3 className="text-xl font-heading font-bold text-text-primary mb-1">All Caught Up</h3>
            <p className="text-sm text-text-secondary">There are no pending requests for your department.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {requests.map(req => (
              <div key={req.request_id} className="bg-surface rounded-2xl border border-border p-6 flex flex-col md:flex-row gap-6 shadow-card glass">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-brand-primary/10 text-brand-primary text-xs px-2.5 py-0.5 rounded-full font-bold border border-brand-primary/20">
                      {req.request_type === 'external_department' ? 'External Request' : 'Inter-Station'}
                    </span>
                    <span className="text-text-muted text-xs flex items-center gap-1 font-mono">
                      <Clock className="h-3 w-3" />
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-text-primary mb-2 font-mono">Case ID: {req.case_id}</h3>
                  <div className="bg-input-bg rounded-xl p-4 border border-input-border font-mono text-xs text-text-secondary whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {req.draft_content}
                  </div>
                </div>
                <div className="flex items-end md:w-44">
                  <Button 
                    fullWidth
                    onClick={() => openModal(req)}
                    leftIcon={<FileText className="h-4 w-4" />}
                    className="font-bold"
                  >
                    Reply
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Response Modal */}
      {selectedReq && (
        <div className="fixed inset-0 bg-overlay-bg backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-surface rounded-2xl border border-border w-full max-w-3xl overflow-hidden shadow-elevated flex flex-col max-h-[90vh] animate-scale-in">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-heading font-bold text-text-primary">Generate Response</h2>
              <p className="text-text-secondary text-xs mt-1 font-mono">Replying to Request ID: {selectedReq.request_id}</p>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">Response Content</label>
                <textarea
                  value={responseContent}
                  onChange={(e) => setResponseContent(e.target.value)}
                  className="w-full h-48 bg-input-bg border border-input-border rounded-xl p-4 text-text-primary font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-brand-primary transition-all duration-200"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">Attachment (Optional)</label>
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full bg-input-bg border border-input-border rounded-xl p-2.5 text-text-primary text-xs"
                />
              </div>

              <p className="text-xs text-text-muted italic">
                This response will be ingested into the Crime OS backend as formal evidence, completing the associated Case Checklist step.
              </p>
            </div>
            
            <div className="p-6 border-t border-border bg-surface-elevated/40 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setSelectedReq(null)}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
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
              >
                {submitting ? 'Formatting...' : 'Format with AI'}
              </Button>
              <Button
                onClick={submitResponse}
                disabled={submitting}
                isLoading={submitting}
                leftIcon={<Send className="h-4 w-4" />}
                className="font-bold"
              >
                Submit to Crime OS
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
