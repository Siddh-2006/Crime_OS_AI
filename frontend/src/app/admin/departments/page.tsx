'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Building2,
  Plus,
  Edit2,
  PowerOff,
  Power,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/Loader';
import AdminNavbar from '@/components/admin/AdminNavbar';
import apiClient from '@/lib/axios';

interface DepartmentRegistry {
  _id: string;
  entity_id: string;
  entity_name: string;
  category: string;
  what_they_can_provide: string[];
  legal_basis_typically_cited: string[];
  request_format_expected: string;
  typical_response_time: string;
  escalation_path_if_no_response: string;
  notes_or_caveats: string;
  confidence: string;
  contact_email?: string;
  qdrant_uuid?: string;
  isActive: boolean;
}

interface DeptFormValues {
  entity_id: string;
  entity_name: string;
  category: string;
  what_they_can_provide: string;       // textarea — newline-separated
  legal_basis_typically_cited: string; // textarea — newline-separated
  request_format_expected: string;
  typical_response_time: string;
  escalation_path_if_no_response: string;
  notes_or_caveats: string;
  confidence: string;
  contact_email: string;
}

const CONFIDENCE_OPTIONS = [
  { value: 'high',   label: 'High (response highly reliable and consistently provided)' },
  { value: 'medium', label: 'Medium (response usually provided, occasional delays)' },
  { value: 'low',    label: 'Low (response unreliable, may need escalation)' },
];

export default function AdminDepartmentsPage(): React.ReactElement {
  const { toasts, showToast, removeToast } = useToast();

  const [departments, setDepartments] = useState<DepartmentRegistry[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentRegistry | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DeptFormValues>({ defaultValues: { confidence: 'high' } });

  const fetchDepartments = useCallback(async () => {
    try {
      setIsLoadingData(true);
      const res = await apiClient.get('/admin/departments');
      if (res.data.success) setDepartments(res.data.data);
    } catch (err: any) {
      showToast('error', err.response?.data?.message || 'Failed to fetch departments');
    } finally {
      setIsLoadingData(false);
    }
  }, [showToast]);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  const openAddModal = () => {
    setEditingDept(null);
    reset({ confidence: 'high', contact_email: '' });
    setIsDeptModalOpen(true);
  };

  const openEditModal = (dept: DepartmentRegistry) => {
    setEditingDept(dept);
    setValue('entity_id', dept.entity_id);
    setValue('entity_name', dept.entity_name);
    setValue('category', dept.category);
    setValue('what_they_can_provide', dept.what_they_can_provide.join('\n'));
    setValue('legal_basis_typically_cited', dept.legal_basis_typically_cited.join('\n'));
    setValue('request_format_expected', dept.request_format_expected || '');
    setValue('typical_response_time', dept.typical_response_time || '');
    setValue('escalation_path_if_no_response', dept.escalation_path_if_no_response || '');
    setValue('notes_or_caveats', dept.notes_or_caveats || '');
    setValue('confidence', dept.confidence || 'high');
    setValue('contact_email', dept.contact_email || '');
    setIsDeptModalOpen(true);
  };

  const onSubmit = async (data: DeptFormValues) => {
    try {
      const payload = {
        ...data,
        what_they_can_provide:      data.what_they_can_provide.split('\n').map(s => s.trim()).filter(Boolean),
        legal_basis_typically_cited: data.legal_basis_typically_cited.split('\n').map(s => s.trim()).filter(Boolean),
      };

      if (editingDept) {
        await apiClient.put(`/admin/departments/${editingDept._id}`, payload);
        showToast('Department updated. Vector re-embedded.', 'success');
      } else {
        await apiClient.post('/admin/departments', payload);
        showToast('Department added and embedded.', 'success');
      }
      setIsDeptModalOpen(false);
      fetchDepartments();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to save department', 'error');
    }
  };

  const deactivate = async (dept: DepartmentRegistry) => {
    if (!confirm(`Deactivate "${dept.entity_name}"? It will be removed from the AI knowledge base.`)) return;
    try {
      await apiClient.patch(`/admin/departments/${dept._id}/deactivate`);
      showToast('Department deactivated and vector removed.', 'success');
      fetchDepartments();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to deactivate', 'error');
    }
  };

  const activate = async (dept: DepartmentRegistry) => {
    if (!confirm(`Re-activate "${dept.entity_name}"? It will be re-embedded into the AI knowledge base.`)) return;
    try {
      await apiClient.patch(`/admin/departments/${dept._id}/activate`);
      showToast('Department re-activated and re-embedded.', 'success');
      fetchDepartments();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to activate', 'error');
    }
  };

  const visible = showInactive ? departments : departments.filter(d => d.isActive);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <AdminNavbar />

      <main className="flex-grow p-6 lg:px-12 max-w-7xl mx-auto w-full">
        {/* Toolbar */}
        <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-text-primary">Department Registry</h2>
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={e => setShowInactive(e.target.checked)}
                className="rounded"
              />
              Show inactive
            </label>
          </div>
          <Button onClick={openAddModal} className="bg-blue-600 hover:bg-blue-700">
            <Plus size={18} className="mr-2" />
            Add Department
          </Button>
        </div>

        {isLoadingData ? (
          <div className="flex justify-center items-center h-64"><Loader size="lg" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((dept) => (
              <Card
                key={dept._id}
                className={`p-5 flex flex-col justify-between hover:shadow-lg transition-shadow ${!dept.isActive ? 'opacity-60 border-dashed' : ''}`}
              >
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-base text-[#1a237e] truncate" title={dept.entity_name}>
                      {dept.entity_name}
                    </h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${dept.isActive ? 'bg-green-100 text-green-800' : 'bg-surface-elevated text-text-muted'}`}>
                      {dept.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary font-mono mb-3">{dept.entity_id}</p>

                  <div className="text-sm text-text-primary space-y-1">
                    <p><span className="font-medium">Category:</span> {dept.category}</p>
                    <p><span className="font-medium">Confidence:</span> {dept.confidence}</p>
                    <p><span className="font-medium">Email:</span> {dept.contact_email || <span className="text-text-secondary italic">not set</span>}</p>
                    {dept.qdrant_uuid && (
                      <p className="text-xs text-text-secondary font-mono truncate" title={dept.qdrant_uuid}>
                        Vector: {dept.qdrant_uuid.slice(0, 16)}…
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex space-x-2 mt-4 pt-4 border-t border-input-border">
                  <Button variant="ghost" size="sm" onClick={() => openEditModal(dept)} className="flex-1">
                    <Edit2 size={14} className="mr-1" /> Edit
                  </Button>
                  {dept.isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deactivate(dept)}
                      className="flex-1 text-red-600 hover:bg-red-50"
                    >
                      <PowerOff size={14} className="mr-1" /> Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => activate(dept)}
                      className="flex-1 text-green-700 hover:bg-green-50"
                    >
                      <Power size={14} className="mr-1" /> Activate
                    </Button>
                  )}
                </div>
              </Card>
            ))}

            {visible.length === 0 && (
              <div className="col-span-full py-12 text-center text-text-muted bg-white rounded-lg border border-dashed border-border">
                <Building2 size={48} className="mx-auto mb-4 text-text-muted" />
                <p>{showInactive ? 'No departments found.' : 'No active departments. Enable "Show inactive" to see all.'}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        title={editingDept ? `Edit — ${editingDept.entity_name}` : 'Add New Department'}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[72vh] overflow-y-auto px-1 pb-2">

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Entity ID (unique)*"
              {...register('entity_id', { required: 'Required' })}
              error={errors.entity_id?.message}
              disabled={!!editingDept}
              placeholder="e.g. hdfc_bank"
            />
            <Input
              label="Entity Name*"
              {...register('entity_name', { required: 'Required' })}
              error={errors.entity_name?.message}
              placeholder="e.g. HDFC Bank"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Category*"
              {...register('category', { required: 'Required' })}
              error={errors.category?.message}
              placeholder="e.g. bank, telecom, court"
            />
            <Input
              label="Contact Email"
              type="email"
              {...register('contact_email')}
              placeholder="nodal@department.gov.in"
            />
          </div>

          {/* Confidence dropdown */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Confidence
            </label>
            <select
              {...register('confidence')}
              className="w-full rounded-md border border-border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-white"
            >
              {CONFIDENCE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Arrays as textarea — one item per line */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              What They Can Provide* <span className="text-text-secondary font-normal">(one item per line)</span>
            </label>
            <textarea
              {...register('what_they_can_provide', { required: 'Required' })}
              className="w-full rounded-md border-border border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
              rows={4}
              placeholder="Account KYC details&#10;Transaction statements&#10;CDR logs"
            />
            {errors.what_they_can_provide && (
              <p className="text-red-500 text-xs mt-1">{errors.what_they_can_provide.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Legal Basis <span className="text-text-secondary font-normal">(one item per line)</span>
            </label>
            <textarea
              {...register('legal_basis_typically_cited')}
              className="w-full rounded-md border-border border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
              rows={3}
              placeholder="BNSS Section 94&#10;IT Act Section 69"
            />
          </div>

          <Input
            label="Request Format Expected"
            {...register('request_format_expected')}
            placeholder="e.g. Written notice under Section 94 BNSS"
          />
          <Input
            label="Typical Response Time"
            {...register('typical_response_time')}
            placeholder="e.g. 3–7 working days"
          />
          <Input
            label="Escalation Path if No Response"
            {...register('escalation_path_if_no_response')}
            placeholder="e.g. Issue summons to Branch Manager"
          />

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Notes / Caveats</label>
            <textarea
              {...register('notes_or_caveats')}
              className="w-full rounded-md border-border border shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
              rows={2}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-input-border">
            <Button type="button" variant="ghost" onClick={() => setIsDeptModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {editingDept ? 'Update Department' : 'Add Department'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
