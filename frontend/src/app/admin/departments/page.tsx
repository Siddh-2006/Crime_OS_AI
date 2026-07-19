'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import {
  Building2,
  Plus,
  Edit2,
  PowerOff,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/Loader';
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
  contact_email_pattern?: string;
  isActive: boolean;
}

interface DeptFormValues {
  entity_id: string;
  entity_name: string;
  category: string;
  what_they_can_provide: string;
  legal_basis_typically_cited: string;
  request_format_expected: string;
  typical_response_time: string;
  escalation_path_if_no_response: string;
  notes_or_caveats: string;
  confidence: string;
  contact_email_pattern?: string;
  isActive?: boolean;
}

export default function AdminDepartmentsPage(): React.ReactElement {
  const { logout } = useAuth();
  const router = useRouter();
  const { toasts, showToast, removeToast } = useToast();

  const [departments, setDepartments] = useState<DepartmentRegistry[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentRegistry | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DeptFormValues>();

  const fetchDepartments = useCallback(async () => {
    try {
      setIsLoadingData(true);
      const res = await apiClient.get('/admin/departments');
      if (res.data.success) {
        setDepartments(res.data.data);
      }
    } catch (err: any) {
      showToast('error', err.response?.data?.message || 'Failed to fetch departments');
    } finally {
      setIsLoadingData(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const openAddDeptModal = () => {
    setEditingDept(null);
    reset();
    setIsDeptModalOpen(true);
  };

  const openEditDeptModal = (dept: DepartmentRegistry) => {
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
    setValue('contact_email_pattern', dept.contact_email_pattern || '');
    setIsDeptModalOpen(true);
  };

  const onDeptSubmit = async (data: DeptFormValues) => {
    try {
      const payload = {
        ...data,
        what_they_can_provide: data.what_they_can_provide.split('\n').filter(s => s.trim()),
        legal_basis_typically_cited: data.legal_basis_typically_cited.split('\n').filter(s => s.trim()),
      };

      if (editingDept) {
        const res = await apiClient.put(`/admin/departments/${editingDept._id}`, payload);
        if (res.data.success) {
          showToast('success', 'Department updated successfully');
        }
      } else {
        const res = await apiClient.post('/admin/departments', payload);
        if (res.data.success) {
          showToast('success', 'Department added successfully');
        }
      }
      setIsDeptModalOpen(false);
      fetchDepartments();
    } catch (err: any) {
      showToast('error', err.response?.data?.message || 'Failed to save department');
    }
  };

  const toggleDeptStatus = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this department?')) return;
    try {
      const res = await apiClient.patch(`/admin/departments/${id}/deactivate`);
      if (res.data.success) {
        showToast('success', 'Department deactivated');
        fetchDepartments();
      }
    } catch (err: any) {
      showToast('error', err.response?.data?.message || 'Failed to deactivate department');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* Header */}
      <header className="bg-[#1a237e] text-white py-4 px-6 shadow-md flex justify-between items-center shrink-0">
        <div className="flex items-center space-x-3">
          <Building2 size={28} className="text-blue-200" />
          <h1 className="text-2xl font-bold tracking-tight">Admin | Manage Departments</h1>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            className="text-white border-white hover:bg-white hover:text-[#1a237e] transition-colors"
          >
            <LogOut size={16} className="mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="flex-grow p-6 lg:px-12 max-w-7xl mx-auto w-full">
        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Department Registry</h2>
          <Button onClick={openAddDeptModal} className="bg-blue-600 hover:bg-blue-700">
            <Plus size={18} className="mr-2" />
            Add Department
          </Button>
        </div>

        {/* Content */}
        {isLoadingData ? (
          <div className="flex justify-center items-center h-64">
            <Loader size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {departments.map((dept) => (
              <Card key={dept._id} className="p-5 flex flex-col justify-between hover:shadow-lg transition-shadow">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-[#1a237e] truncate" title={dept.entity_name}>
                      {dept.entity_name}
                    </h3>
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
                      {dept.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-4 font-mono">{dept.entity_id}</p>
                  
                  <div className="text-sm text-gray-700 space-y-1 mb-4">
                    <p><span className="font-medium">Confidence:</span> {dept.confidence}</p>
                    <p><span className="font-medium">Contact:</span> {dept.contact_email_pattern || 'N/A'}</p>
                  </div>
                </div>

                <div className="flex space-x-2 mt-4 pt-4 border-t border-gray-100">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => openEditDeptModal(dept)}
                    className="flex-1"
                  >
                    <Edit2 size={14} className="mr-2" />
                    Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => toggleDeptStatus(dept._id)}
                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <PowerOff size={14} className="mr-2" />
                    Deactivate
                  </Button>
                </div>
              </Card>
            ))}
            
            {departments.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-lg border border-dashed border-gray-300">
                <Building2 size={48} className="mx-auto mb-4 text-gray-300" />
                <p>No departments found in the registry.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        title={editingDept ? 'Edit Department' : 'Add New Department'}
      >
        <form onSubmit={handleSubmit(onDeptSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Entity ID (Unique)*"
              {...register('entity_id', { required: 'Required' })}
              error={errors.entity_id?.message}
              disabled={!!editingDept}
            />
            <Input
              label="Entity Name*"
              {...register('entity_name', { required: 'Required' })}
              error={errors.entity_name?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Category*"
              {...register('category', { required: 'Required' })}
              error={errors.category?.message}
            />
            <Input
              label="Contact Email Pattern"
              placeholder="e.g. nodal@wazirx.com"
              {...register('contact_email_pattern')}
              error={errors.contact_email_pattern?.message}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              What They Can Provide (One per line)*
            </label>
            <textarea
              {...register('what_they_can_provide', { required: 'Required' })}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              rows={4}
            />
            {errors.what_they_can_provide && (
              <p className="text-red-500 text-xs mt-1">{errors.what_they_can_provide.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Legal Basis (One per line)
            </label>
            <textarea
              {...register('legal_basis_typically_cited')}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              rows={3}
            />
          </div>

          <Input
            label="Request Format Expected"
            {...register('request_format_expected')}
          />
          
          <Input
            label="Typical Response Time"
            {...register('typical_response_time')}
          />
          
          <Input
            label="Escalation Path"
            {...register('escalation_path_if_no_response')}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes / Caveats</label>
            <textarea
              {...register('notes_or_caveats')}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              rows={2}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsDeptModalOpen(false)}>
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
