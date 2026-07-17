'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';
import {
  ShieldAlert, ArrowLeft, ArrowRight, ClipboardCheck, Check, Search, X, FileText, Upload, Loader2
} from 'lucide-react';

export default function NewComplaintPage(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Form Fields State
  const [incidentDate, setIncidentDate] = useState('');
  const [incidentTime, setIncidentTime] = useState('');
  const [incidentPlace, setIncidentPlace] = useState('');
  const [category, setCategory] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [detailedDescription, setDetailedDescription] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [coordinates, setCoordinates] = useState('');

  // Step 2 Fields
  const [searchQuery, setSearchQuery] = useState('');
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [selectedStation, setSelectedStation] = useState<any | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Evidence: local File objects only — NOT uploaded yet
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [declareCheck, setDeclareCheck] = useState(false);

  // Load initial list of stations
  useEffect(() => {
    fetchStations('');
  }, []);

  const fetchStations = async (query: string) => {
    setLoadingStations(true);
    try {
      const res = await apiClient.get(API_ROUTES.COMPLAINTS.STATIONS_SEARCH, {
        params: { q: query },
      });
      setStations(res.data.data || []);
    } catch (err) {
      console.error('Failed to load stations', err);
    } finally {
      setLoadingStations(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    fetchStations(val);
  };

  // ─── File Selection Helpers ───────────────────────────────────────────────────
  const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/avi',
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip', 'application/x-zip-compressed',
  ];

  const handleAddFiles = (files: File[]) => {
    const remaining = 10 - selectedFiles.length;
    if (remaining <= 0) {
      setError('Maximum 10 evidence files can be selected.');
      return;
    }

    const toAdd: File[] = [];
    for (const file of files) {
      if (toAdd.length + selectedFiles.length >= 10) break;
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const isAllowedType = ALLOWED_TYPES.includes(file.type) || ['pdf', 'docx', 'doc', 'zip'].includes(ext);
      if (!isAllowedType) {
        setError(`Unsupported file type: ${file.name}`);
        continue;
      }
      if (file.size > 100 * 1024 * 1024) {
        setError(`File too large (max 100MB): ${file.name}`);
        continue;
      }
      toAdd.push(file);
    }

    if (toAdd.length > 0) {
      setSelectedFiles((prev) => [...prev, ...toAdd]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => {
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  };

  // ─── Cloudinary Upload (runs AFTER complaint creation) ────────────────────────
  const uploadFileToCloudinary = async (file: File) => {
    const sigRes = await apiClient.post(API_ROUTES.COMPLAINTS.UPLOAD_SIGNATURE);
    const { signature, timestamp, apiKey, cloudName, folder, publicId } = sigRes.data.data;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);
    formData.append('folder', folder);
    formData.append('public_id', publicId);

    // Determine resource_type — PDFs must be 'raw' to preserve actual PDF bytes
    let resourceType = 'image';
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      resourceType = 'video';
    } else if (
      file.type.includes('pdf') ||
      file.name.endsWith('.pdf') ||
      !file.type.startsWith('image/')
    ) {
      resourceType = 'raw';
    }

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
    const response = await axios.post(uploadUrl, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return {
      publicId: response.data.public_id,
      secureUrl: response.data.secure_url,
      resourceType: response.data.resource_type,
      mimeType: file.type || 'application/octet-stream',
      originalFilename: file.name,
      extension: ext,
      size: response.data.bytes,
    };
  };

  // ─── Validation ───────────────────────────────────────────────────────────────
  const validateStep1 = () => {
    if (!incidentDate) return 'Incident date is required';
    if (new Date(incidentDate) > new Date()) return 'Incident date cannot be in the future';
    if (!incidentPlace.trim()) return 'Incident place is required';
    if (!category) return 'Complaint category is required';
    if (shortDescription.trim().length < 5 || shortDescription.trim().length > 255) {
      return 'Brief description must be between 5 and 255 characters';
    }
    if (detailedDescription.trim().length < 10) {
      return 'Detailed description must be at least 10 characters';
    }
    return null;
  };

  const validateStep2 = () => {
    if (!selectedStation) return 'Please select a Police Station';
    if (!declareCheck) return 'You must accept the legal declaration before submitting';
    return null;
  };

  const handleNext = () => {
    setError(null);
    const err = validateStep1();
    if (err) { setError(err); return; }
    setStep(2);
  };

  const handlePrev = () => {
    setError(null);
    setStep(1);
  };

  // ─── Submit Handler ───────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validationErr = validateStep2();
    if (validationErr) { setError(validationErr); return; }

    setSubmitting(true);
    try {
      // Step 1: Create the complaint (no evidence yet)
      setSubmitStatus('Filing your complaint details...');
      const payload = {
        incidentDate,
        incidentTime: incidentTime || undefined,
        incidentPlace,
        category,
        shortDescription,
        detailedDescription,
        policeStation: selectedStation._id,
        evidence: [],
        emergencyContact: emergencyContact || undefined,
        coordinates: coordinates || undefined,
      };

      const createRes = await apiClient.post(API_ROUTES.COMPLAINTS.CREATE, payload);
      const complaintId = createRes.data.data._id;

      // Step 2: Upload each file and collect metadata
      if (selectedFiles.length > 0) {
        const uploadedEvidence = [];
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          setSubmitStatus(`Uploading evidence ${i + 1} of ${selectedFiles.length}: ${file.name}`);
          const uploaded = await uploadFileToCloudinary(file);
          uploadedEvidence.push(uploaded);
        }

        // Step 3: Attach all uploaded evidence to the complaint
        setSubmitStatus('Finalizing case file and attaching evidence...');
        await apiClient.post(`/complaints/${complaintId}/evidence`, {
          evidence: uploadedEvidence,
        });
      }

      router.push(APP_ROUTES.MY_COMPLAINTS);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Failed to submit complaint. Please try again.'
      );
    } finally {
      setSubmitting(false);
      setSubmitStatus('');
    }
  };

  const categories = [
    { value: 'THEFT', label: 'Theft' },
    { value: 'ROBBERY', label: 'Robbery' },
    { value: 'BURGLARY', label: 'Burglary' },
    { value: 'ASSAULT', label: 'Assault' },
    { value: 'DOMESTIC_VIOLENCE', label: 'Domestic Violence' },
    { value: 'SEXUAL_OFFENCE', label: 'Sexual Offence' },
    { value: 'CYBERCRIME', label: 'Cyber Crime' },
    { value: 'FRAUD', label: 'Financial Fraud' },
    { value: 'PROPERTY_DISPUTE', label: 'Property Dispute' },
    { value: 'MISSING_PERSON', label: 'Missing Person' },
    { value: 'ROAD_ACCIDENT', label: 'Road Accident' },
    { value: 'DRUG_OFFENCE', label: 'Drug Offence' },
    { value: 'PUBLIC_NUISANCE', label: 'Public Nuisance' },
    { value: 'HARASSMENT', label: 'Harassment' },
    { value: 'EXTORTION', label: 'Extortion' },
    { value: 'MURDER', label: 'Murder' },
    { value: 'KIDNAPPING', label: 'Kidnapping' },
    { value: 'OTHER', label: 'Other' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Wizard Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push(APP_ROUTES.MY_COMPLAINTS)}
          className="p-2 hover:bg-neutral-200 rounded-full transition-colors"
          title="Back to complaints"
        >
          <ArrowLeft size={20} className="text-neutral-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">E-Application Portal</h1>
          <p className="text-sm text-neutral-500">File a secure online complaint under Gujarat jurisdiction</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span
            className={[
              'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors',
              step === 1 ? 'bg-primary-800 text-white' : 'bg-green-100 text-green-700',
            ].join(' ')}
          >
            {step > 1 ? <Check size={16} /> : '1'}
          </span>
          <span className={`text-sm font-semibold ${step === 1 ? 'text-primary-900' : 'text-neutral-500'}`}>
            Incident Details
          </span>
        </div>
        <div className="h-0.5 w-16 bg-neutral-200 flex-1 mx-4" />
        <div className="flex items-center gap-3">
          <span
            className={[
              'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors',
              step === 2 ? 'bg-primary-800 text-white' : 'bg-neutral-100 text-neutral-400',
            ].join(' ')}
          >
            2
          </span>
          <span className={`text-sm font-semibold ${step === 2 ? 'text-primary-900' : 'text-neutral-400'}`}>
            Station &amp; Evidence
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Submission progress overlay */}
      {submitting && submitStatus && (
        <div className="flex items-center gap-3 p-4 bg-primary-50 border border-primary-200 text-primary-800 rounded-lg text-sm">
          <Loader2 size={18} className="animate-spin flex-shrink-0" />
          <span className="font-medium">{submitStatus}</span>
        </div>
      )}

      {/* ─── Step 1: Incident Details ─── */}
      {step === 1 && (
        <Card className="space-y-6">
          <h2 className="text-lg font-bold text-neutral-900 border-b border-neutral-100 pb-3">
            Step 1: Incident Specifics
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Incident Date *
              </label>
              <input
                type="date"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-neutral-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Approximate Time (Optional)
              </label>
              <input
                type="time"
                value={incidentTime}
                onChange={(e) => setIncidentTime(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-neutral-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Complaint Category *"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={[{ value: '', label: 'Select Category' }, ...categories]}
            />
            <Input
              label="Place of Occurrence *"
              value={incidentPlace}
              onChange={(e) => setIncidentPlace(e.target.value)}
              placeholder="e.g. Near Kalupur Railway Station, Ahmedabad"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Emergency Contact Number (Optional)"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="e.g. 9876543210"
            />
            <Input
              label="Location Coordinates (Optional)"
              value={coordinates}
              onChange={(e) => setCoordinates(e.target.value)}
              placeholder="e.g. 23.0225, 72.5714"
            />
          </div>

          <Input
            label="Brief Summary of Crime (Short Description) *"
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            placeholder="A single line summary of what happened"
            maxLength={255}
          />

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Detailed Description *
            </label>
            <textarea
              value={detailedDescription}
              onChange={(e) => setDetailedDescription(e.target.value)}
              placeholder="Provide a comprehensive narrative of the incident, including details of any suspects, stolen property, or witnesses..."
              rows={6}
              className="w-full px-4 py-2.5 rounded-lg border border-neutral-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all text-sm resize-none"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-neutral-100">
            <Button onClick={handleNext}>
              <span>Continue to Step 2</span>
              <ArrowRight size={16} />
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Step 2: Police Station & Evidence ─── */}
      {step === 2 && (
        <form onSubmit={handleSubmit}>
          <Card className="space-y-6">
            <h2 className="text-lg font-bold text-neutral-900 border-b border-neutral-100 pb-3">
              Step 2: Police Station &amp; Evidence
            </h2>

            {/* Searchable Police Station Dropdown */}
            <div className="relative">
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Assign Police Station (Gujarat Jurisdiction) *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={selectedStation ? selectedStation.name : searchQuery}
                  onChange={(e) => {
                    if (selectedStation) setSelectedStation(null);
                    handleSearchChange(e);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  placeholder="Type to search police stations (e.g. Maninagar, Kalupur)..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all text-sm"
                />
                <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                {selectedStation && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStation(null);
                      setSearchQuery('');
                      fetchStations('');
                    }}
                    className="absolute right-3 top-3 text-neutral-400 hover:text-neutral-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {dropdownOpen && !selectedStation && (
                <div className="absolute z-10 w-full bg-white border border-neutral-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                  {loadingStations && (
                    <p className="text-sm text-neutral-500 p-3 text-center">Searching stations...</p>
                  )}
                  {!loadingStations && stations.length === 0 && (
                    <p className="text-sm text-neutral-500 p-3 text-center">No matching stations found.</p>
                  )}
                  {!loadingStations &&
                    stations.map((st) => (
                      <button
                        key={st._id}
                        type="button"
                        onClick={() => {
                          setSelectedStation(st);
                          setDropdownOpen(false);
                          setSearchQuery('');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-100 border-b border-neutral-50 last:border-0 flex flex-col"
                      >
                        <span className="font-semibold text-neutral-800">{st.name}</span>
                        <span className="text-xs text-neutral-500">
                          Code: {st.code} | City: {st.city} | District: {st.district}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Evidence File Selector — local only, no upload yet */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                Attach Supporting Evidence
              </label>
              <p className="text-xs text-neutral-500 mb-3">
                Select up to 10 files (Images, Videos, Audio, PDF, DOCX, ZIP — max 100MB each).
                Files will be securely uploaded only after you submit the complaint.
              </p>

              {selectedFiles.length < 10 && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files) {
                      setError(null);
                      handleAddFiles(Array.from(e.dataTransfer.files));
                    }
                  }}
                  onClick={() => document.getElementById('evidence-file-input')?.click()}
                  className={[
                    'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200',
                    isDragging
                      ? 'border-primary-500 bg-primary-50/60 scale-[0.99]'
                      : 'border-neutral-300 hover:border-primary-400 bg-neutral-50/50 hover:bg-neutral-100/30',
                  ].join(' ')}
                >
                  <input
                    type="file"
                    id="evidence-file-input"
                    className="hidden"
                    multiple
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip"
                    onChange={(e) => {
                      if (e.target.files) {
                        setError(null);
                        handleAddFiles(Array.from(e.target.files));
                        e.target.value = '';
                      }
                    }}
                  />
                  <Upload size={32} className="mx-auto text-neutral-400 mb-3" />
                  <p className="text-sm font-semibold text-neutral-700">
                    Drag &amp; drop files here, or{' '}
                    <span className="text-primary-600 hover:underline">browse</span>
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    No upload happens until you submit
                  </p>
                </div>
              )}

              {selectedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Selected Files ({selectedFiles.length}/10)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedFiles.map((file, idx) => {
                      const ext = file.name.split('.').pop()?.toUpperCase() ?? '';
                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-3 bg-white border border-neutral-200 rounded-lg shadow-sm"
                        >
                          <FileText className="h-5 w-5 text-primary-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-neutral-800 truncate" title={file.name}>
                              {file.name}
                            </p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">
                              {(file.size / 1024 / 1024).toFixed(2)} MB · {ext}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            disabled={submitting}
                            className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-red-500 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Legal Declaration */}
            <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-lg">
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  id="declaration"
                  checked={declareCheck}
                  onChange={(e) => setDeclareCheck(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="declaration" className="text-xs text-neutral-700 leading-relaxed cursor-pointer">
                  I hereby solemnly declare that all statements made in this e-application are true, complete and correct
                  to the best of my knowledge and belief. I understand that filing a false police report is a punishable
                  offence under Section 182 of the Indian Penal Code (IPC) and other relevant acts.
                </label>
              </div>
            </div>

            {/* Footer Navigation */}
            <div className="flex justify-between items-center pt-4 border-t border-neutral-100">
              <Button type="button" variant="ghost" onClick={handlePrev} leftIcon={<ArrowLeft size={16} />}>
                Back to Details
              </Button>
              <Button type="submit" isLoading={submitting} leftIcon={<ClipboardCheck size={18} />}>
                {submitting ? 'Processing...' : 'Submit Complaint'}
              </Button>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}
