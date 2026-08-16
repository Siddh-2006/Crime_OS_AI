'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import {
  ShieldCheck,
  Building2,
  Users,
  Plus,
  Edit2,
  Trash2,
  LogOut,
  Power,
  PowerOff,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loader } from '@/components/ui/Loader';
import { ROLE } from '@/lib/constants';
import AdminNavbar from '@/components/admin/AdminNavbar';
import apiClient from '@/lib/axios';
import type { ApiResponse } from '@/lib/types';
import type { AxiosError } from 'axios';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface PoliceStation {
  _id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  phone: string;
  email?: string;
  isActive: boolean;
  pastExperience?: string;
  expertise?: string[];
  photoUrl?: string;
}

interface Officer {
  _id: string;
  officerName: string;
  badgeNumber: string;
  email: string;
  phone: string;
  role: 'SHO' | 'IO';
  policeStation: {
    _id: string;
    name: string;
    code: string;
  } | string;
  isActive: boolean;
  pastExperience?: string;
  expertise?: string[];
  photoUrl?: string;
}

interface StationFormValues {
  name: string;
  code: string;
  address: string;
  city: string;
  district: string;
  pincode: string;
  phone: string;
  email: string;
  isActive?: boolean;
}

interface OfficerFormValues {
  officerName: string;
  badgeNumber: string;
  email: string;
  phone: string;
  role: 'SHO' | 'IO';
  policeStation: string;
  password?: string;
  isActive?: boolean;
}

export default function AdminDashboardPage(): React.ReactElement {
  const { logout } = useAuth();
  const router = useRouter();
  const { toasts, showToast, removeToast } = useToast();

  const [activeTab, setActiveTab] = useState<'stations' | 'officers'>('stations');
  const [stations, setStations] = useState<PoliceStation[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Modal control states
  const [isStationModalOpen, setIsStationModalOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<PoliceStation | null>(null);

  const [isOfficerModalOpen, setIsOfficerModalOpen] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<Officer | null>(null);

  // ─── Forms ─────────────────────────────────────────────────────────────────

  const stationForm = useForm<StationFormValues>({
    defaultValues: {
      name: '',
      code: '',
      address: '',
      city: '',
      district: '',
      pincode: '',
      phone: '',
      email: '',
      isActive: true,
    },
  });

  const officerForm = useForm<OfficerFormValues>({
    defaultValues: {
      officerName: '',
      badgeNumber: '',
      email: '',
      phone: '',
      role: 'IO',
      policeStation: '',
      password: '',
      isActive: true,
    },
  });

  // ─── Data Fetching ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [stationsRes, officersRes] = await Promise.all([
        apiClient.get<ApiResponse<PoliceStation[]>>('/admin/police-stations'),
        apiClient.get<ApiResponse<Officer[]>>('/admin/officers'),
      ]);
      if (stationsRes.data.success) setStations(stationsRes.data.data ?? []);
      if (officersRes.data.success) setOfficers(officersRes.data.data ?? []);
    } catch {
      showToast('Failed to load dashboard data', 'error');
    } finally {
      setIsLoadingData(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Actions: Station ──────────────────────────────────────────────────────

  const handleOpenStationModal = (station: PoliceStation | null = null) => {
    setEditingStation(station);
    if (station) {
      stationForm.reset({
        name: station.name,
        code: station.code,
        address: station.address,
        city: station.city,
        district: station.district,
        pincode: station.pincode,
        phone: station.phone,
        email: station.email ?? '',
        isActive: station.isActive,
      });
    } else {
      stationForm.reset({
        name: '',
        code: '',
        address: '',
        city: '',
        district: '',
        pincode: '',
        phone: '',
        email: '',
        isActive: true,
      });
    }
    setIsStationModalOpen(true);
  };

  const onStationSubmit = async (values: StationFormValues) => {
    try {
      if (editingStation) {
        await apiClient.put(`/admin/police-stations/${editingStation._id}`, values);
        showToast('Police station updated successfully', 'success');
      } else {
        await apiClient.post('/admin/police-stations', values);
        showToast('Police station created successfully', 'success');
      }
      setIsStationModalOpen(false);
      fetchData();
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      showToast(axiosErr.response?.data?.message ?? 'Failed to save station', 'error');
    }
  };

  const handleDeleteStation = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this police station?')) return;
    try {
      await apiClient.delete(`/admin/police-stations/${id}`);
      showToast('Police station deleted successfully', 'success');
      fetchData();
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      showToast(axiosErr.response?.data?.message ?? 'Failed to delete station', 'error');
    }
  };

  // ─── Actions: Officer ──────────────────────────────────────────────────────

  const handleOpenOfficerModal = (officer: Officer | null = null) => {
    setEditingOfficer(officer);
    if (officer) {
      const stationId =
        typeof officer.policeStation === 'object'
          ? officer.policeStation?._id
          : officer.policeStation;

      officerForm.reset({
        officerName: officer.officerName,
        badgeNumber: officer.badgeNumber,
        email: officer.email,
        phone: officer.phone,
        role: officer.role,
        policeStation: stationId ?? '',
        password: '', // blank by default on edit
        isActive: officer.isActive,
      });
    } else {
      officerForm.reset({
        officerName: '',
        badgeNumber: '',
        email: '',
        phone: '',
        role: 'IO',
        policeStation: stations[0]?._id ?? '',
        password: '',
        isActive: true,
      });
    }
    setIsOfficerModalOpen(true);
  };

  const onOfficerSubmit = async (values: OfficerFormValues) => {
    try {
      if (editingOfficer) {
        // If password is blank on update, exclude it
        if (!values.password) {
          delete values.password;
        }
        await apiClient.put(`/admin/officers/${editingOfficer._id}`, values);
        showToast('Officer updated successfully', 'success');
      } else {
        await apiClient.post('/admin/officers', values);
        showToast('Officer created successfully', 'success');
      }
      setIsOfficerModalOpen(false);
      fetchData();
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      showToast(axiosErr.response?.data?.message ?? 'Failed to save officer', 'error');
    }
  };

  const handleDeleteOfficer = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this officer?')) return;
    try {
      await apiClient.delete(`/admin/officers/${id}`);
      showToast('Officer deleted successfully', 'success');
      fetchData();
    } catch (err) {
      const axiosErr = err as AxiosError<ApiResponse>;
      showToast(axiosErr.response?.data?.message ?? 'Failed to delete officer', 'error');
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/admin/login');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Header */}
      <AdminNavbar />

      {/* Main Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-neutral-200 bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('stations')}
            className={[
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium rounded-md transition-colors',
              activeTab === 'stations'
                ? 'bg-primary-50 text-primary-900 shadow-sm font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50',
            ].join(' ')}
          >
            <Building2 size={18} />
            Police Stations ({stations.length})
          </button>
          <button
            onClick={() => setActiveTab('officers')}
            className={[
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium rounded-md transition-colors',
              activeTab === 'officers'
                ? 'bg-primary-50 text-primary-900 shadow-sm font-semibold'
                : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50',
            ].join(' ')}
          >
            <Users size={18} />
            Police Officers ({officers.length})
          </button>
        </div>

        {/* Tab Content */}
        {isLoadingData ? (
          <div className="h-64 flex justify-center items-center">
            <Loader size="lg" label="Fetching configurations..." />
          </div>
        ) : activeTab === 'stations' ? (
          /* ─── Police Stations Section ─── */
          <Card>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Manage Police Stations</h2>
                <p className="text-sm text-neutral-500">Add, edit, or delete Gujarat jurisdiction stations</p>
              </div>
              <Button leftIcon={<Plus size={16} />} onClick={() => handleOpenStationModal()}>
                Add Station
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Station Info</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-neutral-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {stations.map((station) => (
                    <tr key={station._id} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-neutral-900">{station.name}</div>
                        <div className="text-xs text-neutral-500 font-mono">Code: {station.code}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-neutral-900">{station.city}, {station.district}</div>
                        <div className="text-xs text-neutral-500">{station.address}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-neutral-900">{station.phone}</div>
                        <div className="text-xs text-neutral-500">{station.email || 'No email'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={[
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold',
                            station.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800',
                          ].join(' ')}
                        >
                          {station.isActive ? <Power size={12} /> : <PowerOff size={12} />}
                          {station.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleOpenStationModal(station)}
                          className="text-primary-600 hover:text-primary-900 transition-colors"
                          title="Edit Station"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteStation(station._id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Delete Station"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {stations.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-neutral-500">
                        No police stations configured. Click "Add Station" to configure one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          /* ─── Police Officers Section ─── */
          <Card>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">Manage Police Officers</h2>
                <p className="text-sm text-neutral-500">Manage credentials, stations and assignments</p>
              </div>
              <Button
                leftIcon={<Plus size={16} />}
                onClick={() => handleOpenOfficerModal()}
                disabled={stations.length === 0}
                title={stations.length === 0 ? 'Create a police station first' : ''}
              >
                Add Officer
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Officer Details</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Assignment</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-neutral-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-neutral-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {officers.map((officer) => (
                    <tr key={officer._id} className="hover:bg-neutral-50/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-neutral-900">{officer.officerName}</div>
                        <div className="text-xs text-neutral-500 font-mono">Badge: {officer.badgeNumber}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-neutral-900">
                          {typeof officer.policeStation === 'object'
                            ? officer.policeStation?.name
                            : 'Unknown Station'}
                        </div>
                        <div className="text-xs text-neutral-500 font-mono">
                          Station Code:{' '}
                          {typeof officer.policeStation === 'object'
                            ? officer.policeStation?.code
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-neutral-900">{officer.email}</div>
                        <div className="text-xs text-neutral-500">{officer.phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={[
                            'inline-flex px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider',
                            officer.role === 'SHO'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800',
                          ].join(' ')}
                        >
                          {officer.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={[
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold',
                            officer.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800',
                          ].join(' ')}
                        >
                          {officer.isActive ? <UserCheck size={12} /> : <UserX size={12} />}
                          {officer.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleOpenOfficerModal(officer)}
                          className="text-primary-600 hover:text-primary-900 transition-colors"
                          title="Edit Officer"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteOfficer(officer._id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Delete Officer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {officers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-neutral-500">
                        No police officers configured. Click "Add Officer" to configure one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>

      {/* ─── Modal: Police Station Form ─── */}
      <Modal
        isOpen={isStationModalOpen}
        onClose={() => setIsStationModalOpen(false)}
        title={editingStation ? 'Edit Police Station' : 'Create Police Station'}
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setIsStationModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="station_form"
              isLoading={stationForm.formState.isSubmitting}
            >
              {editingStation ? 'Save Changes' : 'Create Station'}
            </Button>
          </div>
        }
      >
        <form
          id="station_form"
          onSubmit={stationForm.handleSubmit(onStationSubmit)}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Station Name"
              required
              error={stationForm.formState.errors.name?.message}
              {...stationForm.register('name', { required: 'Name is required' })}
            />
            <Input
              label="Station Code"
              required
              disabled={!!editingStation}
              placeholder="e.g. AHM001"
              error={stationForm.formState.errors.code?.message}
              {...stationForm.register('code', { required: 'Code is required' })}
            />
          </div>
          <Input
            label="Address"
            required
            error={stationForm.formState.errors.address?.message}
            {...stationForm.register('address', { required: 'Address is required' })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="City"
              required
              error={stationForm.formState.errors.city?.message}
              {...stationForm.register('city', { required: 'City is required' })}
            />
            <Input
              label="District"
              required
              error={stationForm.formState.errors.district?.message}
              {...stationForm.register('district', { required: 'District is required' })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Pincode"
              required
              error={stationForm.formState.errors.pincode?.message}
              {...stationForm.register('pincode', {
                required: 'Pincode is required',
                pattern: { value: /^\d{6}$/, message: 'Enter a valid 6-digit pincode' },
              })}
            />
            <Input
              label="Phone Number"
              required
              error={stationForm.formState.errors.phone?.message}
              {...stationForm.register('phone', { required: 'Phone is required' })}
            />
          </div>
          <Input
            label="Email Address"
            type="email"
            error={stationForm.formState.errors.email?.message}
            {...stationForm.register('email')}
          />
          {editingStation && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="station_isActive"
                className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                {...stationForm.register('isActive')}
              />
              <label htmlFor="station_isActive" className="text-sm font-medium text-neutral-700">
                Active Station
              </label>
            </div>
          )}
        </form>
      </Modal>

      {/* ─── Modal: Officer Form ─── */}
      <Modal
        isOpen={isOfficerModalOpen}
        onClose={() => setIsOfficerModalOpen(false)}
        title={editingOfficer ? 'Edit Police Officer' : 'Create Police Officer'}
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="ghost" onClick={() => setIsOfficerModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="officer_form"
              isLoading={officerForm.formState.isSubmitting}
            >
              {editingOfficer ? 'Save Changes' : 'Create Officer'}
            </Button>
          </div>
        }
      >
        <form
          id="officer_form"
          onSubmit={officerForm.handleSubmit(onOfficerSubmit)}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Officer Name"
              required
              error={officerForm.formState.errors.officerName?.message}
              {...officerForm.register('officerName', { required: 'Name is required' })}
            />
            <Input
              label="Badge Number"
              required
              disabled={!!editingOfficer}
              placeholder="e.g. GUJ-SHO-001"
              error={officerForm.formState.errors.badgeNumber?.message}
              {...officerForm.register('badgeNumber', { required: 'Badge Number is required' })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email Address"
              type="email"
              required
              error={officerForm.formState.errors.email?.message}
              {...officerForm.register('email', { required: 'Email is required' })}
            />
            <Input
              label="Phone Number"
              required
              error={officerForm.formState.errors.phone?.message}
              {...officerForm.register('phone', {
                required: 'Phone is required',
                pattern: { value: /^[6-9]\d{9}$/, message: 'Enter a valid 10-digit number' },
              })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Role"
              required
              options={[
                { value: 'SHO', label: 'Station House Officer (SHO)' },
                { value: 'IO', label: 'Investigation Officer (IO)' },
              ]}
              error={officerForm.formState.errors.role?.message}
              {...officerForm.register('role', { required: 'Role is required' })}
            />
            <Select
              label="Assigned Police Station"
              required
              options={stations.map((st) => ({ value: st._id, label: `${st.name} (${st.code})` }))}
              error={officerForm.formState.errors.policeStation?.message}
              {...officerForm.register('policeStation', { required: 'Police Station is required' })}
            />
          </div>

          <Input
            label={editingOfficer ? 'Change Password (leave blank to keep current)' : 'Password'}
            type="password"
            required={!editingOfficer}
            error={officerForm.formState.errors.password?.message}
            {...officerForm.register('password', {
              required: editingOfficer ? false : 'Password is required',
              pattern: editingOfficer
                ? undefined
                : {
                    value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
                    message: 'At least one uppercase, lowercase, number and special char',
                  },
            })}
          />

          {editingOfficer && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="officer_isActive"
                className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                {...officerForm.register('isActive')}
              />
              <label htmlFor="officer_isActive" className="text-sm font-medium text-neutral-700">
                Active Duty
              </label>
            </div>
          )}
        </form>
      </Modal>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
