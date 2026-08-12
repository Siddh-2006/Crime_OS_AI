'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import apiClient from '@/lib/axios';
import { API_ROUTES, APP_ROUTES } from '@/lib/constants';
import {
  ShieldAlert, ArrowLeft, ArrowRight, ClipboardCheck, Check, Search, X, FileText, Upload,
  Loader2, Mic, Calendar, Clock, MapPin, Film, Music, Eye, Trash2, HelpCircle, Paperclip, MailCheck, BadgeCheck
} from 'lucide-react';

interface UploadedFile {
  publicId: string;
  secureUrl: string;
  resourceType: string;
  mimeType: string;
  originalFilename: string;
  extension: string;
  size: number;
  source?: 'evidence' | 'complaint-intake';
  isPhysical?: boolean;
  physicalDetails?: {
    name: string;
    description: string;
    locationFound: string;
    currentLocation: string;
  };
}

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
  tempUrl?: string;
  size: number;
  source?: 'evidence' | 'complaint-intake';
}

interface ComplaintDraftResponse {
  prefill?: {
    shortDescription?: string | null;
    detailedDescription?: string | null;
    incidentDate?: string | null;
    incidentTime?: string | null;
    incidentPlace?: string | null;
    approximateDateText?: string | null;
    coordinates?: string | null;
    address?: string | null;
    category?: string | null;
  };
  missing_fields?: string[];
  missingFields?: string[];
  confidence?: number;
  summary?: string;
  files?: UploadedFile[];
}

export default function NewComplaintPage(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [complainantVerified, setComplainantVerified] = useState(false);

  // ─── Step 1: Complainant profile details ───────────────────────────────────
  const [complainantFirstName, setComplainantFirstName] = useState('');
  const [complainantLastName, setComplainantLastName] = useState('');
  const [complainantEmail, setComplainantEmail] = useState('');
  const [complainantPhone, setComplainantPhone] = useState('');
  const [complainantDob, setComplainantDob] = useState('');
  const [complainantGender, setComplainantGender] = useState('MALE');
  const [complainantAddress, setComplainantAddress] = useState('');
  const [complainantCity, setComplainantCity] = useState('');
  const [complainantDistrict, setComplainantDistrict] = useState('');
  const [complainantState, setComplainantState] = useState('Gujarat');
  const [complainantPincode, setComplainantPincode] = useState('');
  const [complainantIdProofType, setComplainantIdProofType] = useState('AADHAAR');
  const [complainantIdProofNumber, setComplainantIdProofNumber] = useState('');
  const [complainantId, setComplainantId] = useState('');

  // ─── Step 2: Incident State ────────────────────────────────────────────────
  const [shortDescription, setShortDescription] = useState(''); // Complaint Title
  const [isApproximateDate, setIsApproximateDate] = useState(false);
  const [incidentDate, setIncidentDate] = useState('');
  const [approximateDateText, setApproximateDateText] = useState('');
  const [timePeriod, setTimePeriod] = useState('exact'); // 'morning', 'afternoon', 'evening', 'night', 'unknown', 'exact'
  const [incidentTime, setIncidentTime] = useState('');

  // Location search, coordinates & Leaflet map integration
  const [incidentPlace, setIncidentPlace] = useState(''); // Address string
  const [coordinates, setCoordinates] = useState('');
  const [searchAddressQuery, setSearchAddressQuery] = useState('');
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Police Station Select Autocomplete
  const [searchQuery, setSearchQuery] = useState('');
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [selectedStation, setSelectedStation] = useState<any | null>(null);

  // Optional category
  const [category, setCategory] = useState('');

  // ─── Step 2: Describe State ────────────────────────────────────────────────
  const [detailedDescription, setDetailedDescription] = useState('');
  const [isRecordingUIActive, setIsRecordingUIActive] = useState(false);
  const [isComplaintIntakeProcessing, setIsComplaintIntakeProcessing] = useState(false);
  const [intakeStatusMessage, setIntakeStatusMessage] = useState('');

  // Speech-to-Text State
  const [isRecording, setIsRecording] = useState(false);
  const [sttLanguage, setSttLanguage] = useState('en-IN');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [sttError, setSttError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Real-time multilingual client-side language script detector
  const detectLanguage = (text: string) => {
    if (!text) return null;
    const gujRange = /[\u0A80-\u0AFF]/;
    const hinRange = /[\u0900-\u097F]/;
    const benRange = /[\u0980-\u09FF]/;
    const tamRange = /[\u0B80-\u0BFF]/;
    
    if (gujRange.test(text)) return 'Gujarati';
    if (hinRange.test(text)) return 'Hindi / Marathi';
    if (benRange.test(text)) return 'Bengali';
    if (tamRange.test(text)) return 'Tamil';
    
    const latinLetters = (text.match(/[a-zA-Z]/g) || []).length;
    if (latinLetters > text.length * 0.3) {
      return 'English';
    }
    return null;
  };

  // Start STT Recording
  const startSTT = () => {
    setSttError(null);
    setInterimTranscript('');
    
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSttError('Speech recognition is not supported in this browser. Please use Chrome, Safari or Edge.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = sttLanguage;

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        let finalText = '';
        let interimText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          } else {
            interimText += event.results[i][0].transcript;
          }
        }

        if (finalText) {
          setDetailedDescription((prev) => {
            const separator = prev.trim() ? ' ' : '';
            return prev + separator + finalText;
          });
        }
        setInterimTranscript(interimText);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event);
        setSttError(`Error: ${event.error}. Please ensure mic access is allowed.`);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error(err);
      setSttError('Failed to initialize speech recognition.');
    }
  };

  // Stop STT Recording
  const stopSTT = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    setInterimTranscript('');
  };

  // Toggle STT
  const toggleSTT = () => {
    if (isRecording) {
      stopSTT();
    } else {
      startSTT();
    }
  };

  // ─── Step 3: Evidence State ────────────────────────────────────────────────
  const [evidenceFiles, setEvidenceFiles] = useState<UploadedFile[]>([]);
  const [uploadProgressQueue, setUploadProgressQueue] = useState<Record<string, UploadProgress>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);

  // ─── Step 4: AI Review & Submission State ──────────────────────────────────
  const [declareCheck, setDeclareCheck] = useState(false);

  // ─── Physical Evidence State ───────────────────────────────────────────────
  const [isPhysicalModalOpen, setIsPhysicalModalOpen] = useState(false);
  const [physicalData, setPhysicalData] = useState({
    name: '',
    description: '',
    locationFound: '',
    currentLocation: ''
  });
  const [physicalFile, setPhysicalFile] = useState<File | null>(null);

  const handlePhysicalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!physicalFile) return;
    
    // We can use the exact same upload logic by injecting these fields later,
    // but the easiest way is to push it to the queue and tag it after it uploads.
    // For simplicity, we will just call a specialized processPhysicalFile:
    await processPhysicalFile(physicalFile, physicalData);
    
    setIsPhysicalModalOpen(false);
    setPhysicalData({ name: '', description: '', locationFound: '', currentLocation: '' });
    setPhysicalFile(null);
  };

  const processPhysicalFile = async (file: File, details: any) => {
    const fileId = `phy-${Date.now()}`;
    const ext = file.name.split('.').pop() || '';
    
    setUploadProgressQueue((prev) => ({
      ...prev,
      [fileId]: {
        fileName: file.name,
        progress: 0,
        status: 'uploading',
        tempUrl: URL.createObjectURL(file),
        size: file.size,
      },
    }));

    try {
      const res = await apiClient.get(API_ROUTES.COMPLAINTS.UPLOAD_SIGNATURE);
      const { signature, timestamp, cloudName, apiKey } = res.data;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, true);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploadProgressQueue((prev) => ({
            ...prev,
            [fileId]: { ...prev[fileId], progress: percent },
          }));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          const uploadedItem: UploadedFile = {
            publicId: response.public_id,
            secureUrl: response.secure_url,
            resourceType: response.resource_type,
            mimeType: file.type || 'image/jpeg',
            originalFilename: file.name,
            extension: ext,
            size: response.bytes,
            isPhysical: true,
            physicalDetails: { ...details }
          };

          setEvidenceFiles((prev) => [...prev, uploadedItem]);
          setUploadProgressQueue((prev) => {
            const next = { ...prev };
            next[fileId] = { ...next[fileId], status: 'success', progress: 100 };
            return next;
          });
        } else {
          setUploadProgressQueue((prev) => ({
            ...prev,
            [fileId]: { ...prev[fileId], status: 'error', error: `Upload failed: ${xhr.status}` }
          }));
        }
      };
      
      xhr.onerror = () => {
        setUploadProgressQueue((prev) => ({
          ...prev,
          [fileId]: { ...prev[fileId], status: 'error', error: 'Network error.' }
        }));
      };
      
      xhr.send(formData);
    } catch (err: any) {
      setUploadProgressQueue((prev) => ({
        ...prev,
        [fileId]: { ...prev[fileId], status: 'error', error: err.message }
      }));
    }
  };

  // Refs for Map
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Load initial police stations
  useEffect(() => {
    fetchStations('');
  }, []);

  // Auto-assign police station based on incidentPlace keywords
  useEffect(() => {
    if (!incidentPlace || stations.length === 0) return;

    const addressTokens = incidentPlace
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (addressTokens.length === 0) return;

    let bestStation = null;
    let highestScore = 0;

    stations.forEach((station) => {
      let score = 0;
      const stationText = `${station.name} ${station.city} ${station.district} ${station.address}`.toLowerCase();
      
      addressTokens.forEach((token) => {
        if (stationText.includes(token)) {
          score += 1;
          if (station.city.toLowerCase() === token) score += 2;
          if (station.district.toLowerCase() === token) score += 2;
        }
      });

      if (score > highestScore) {
        highestScore = score;
        bestStation = station;
      }
    });

    if (bestStation) {
      setSelectedStation(bestStation);
    } else if (stations.length > 0 && !selectedStation) {
      setSelectedStation(stations[0]);
    }
  }, [incidentPlace, stations, selectedStation]);

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

  const handleStationSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    fetchStations(val);
  };

  // ─── Dynamic Leaflet Map Injection ──────────────────────────────────────────
  useEffect(() => {
    if (step !== 2) return;

    // Check if Leaflet is already loaded globally
    if ((window as any).L) {
      setMapLoaded(true);
      return;
    }

    // Append CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);
    }

    // Append Script
    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      script.onload = () => {
        setMapLoaded(true);
      };
      script.onerror = () => {
        setMapError(true);
      };
      document.head.appendChild(script);
    } else {
      // Check periodically for library availability
      const interval = setInterval(() => {
        if ((window as any).L) {
          setMapLoaded(true);
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [step]);

  // Initialize Map
  useEffect(() => {
    if (step !== 2 || !mapLoaded || !(window as any).L) return;

    const container = mapContainerRef.current;
    if (!container) return;

    let initialLat = 23.0225;
    let initialLng = 72.5714;
    if (coordinates) {
      const parts = coordinates.split(',');
      if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          initialLat = lat;
          initialLng = lng;
        }
      }
    }

    const L = (window as any).L;

    // Check if map already created on DOM element
    if (!mapRef.current) {
      mapRef.current = L.map(container).setView([initialLat, initialLng], 12);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapRef.current);

      markerRef.current = L.marker([initialLat, initialLng], { draggable: true }).addTo(mapRef.current);
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 0);

      const updateCoordsFromMarker = async () => {
        const position = markerRef.current.getLatLng();
        const coordsStr = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
        setCoordinates(coordsStr);
        await reverseGeocode(position.lat, position.lng);
      };

      markerRef.current.on('dragend', updateCoordsFromMarker);

      mapRef.current.on('click', (e: any) => {
        const position = e.latlng;
        markerRef.current.setLatLng(position);
        const coordsStr = `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`;
        setCoordinates(coordsStr);
        reverseGeocode(position.lat, position.lng);
      });
    }

    return () => {
      // Map cleanup
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [step, mapLoaded]);

  const updateMapMarker = (lat: number, lng: number) => {
    if (mapRef.current && markerRef.current && (window as any).L) {
      const L = (window as any).L;
      const latlng = L.latLng(lat, lng);
      markerRef.current.setLatLng(latlng);
      mapRef.current.setView(latlng, 15);
    }
  };

  const handleReverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (data && data.display_name) {
        setIncidentPlace(data.display_name);
      }
    } catch (err) {
      console.error('Reverse geocode failed', err);
    }
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    await handleReverseGeocode(lat, lng);
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const coordsStr = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        setCoordinates(coordsStr);
        updateMapMarker(latitude, longitude);
        await reverseGeocode(latitude, longitude);
      },
      (err) => {
        console.error('Geolocation retrieve error', err);
        setError('Could not retrieve exact location. Please select on map.');
      }
    );
  };

  const handleSearchAddress = async () => {
    if (!searchAddressQuery.trim()) return;
    setSearchingAddress(true);
    setError(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddressQuery)}&limit=1`, {
        headers: { 'Accept': 'application/json' }
      });
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        const coordsStr = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        setCoordinates(coordsStr);
        setIncidentPlace(data[0].display_name);
        updateMapMarker(lat, lon);
      } else {
        setError('No locations found for: ' + searchAddressQuery);
      }
    } catch (err) {
      console.error('Geocoding search failed', err);
      setError('Could not search address. Please drop pin manually.');
    } finally {
      setSearchingAddress(false);
    }
  };

  // ─── Step 3: Direct Cloudinary File Uploads ──────────────────────────────
  const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'mp4', 'mpeg', 'mov', 'avi', 'mp3', 'wav', 'ogg', 'pdf', 'doc', 'docx', 'zip'];
  const COMPLAINT_INTAKE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'pdf', 'mp3', 'wav', 'm4a', 'ogg', 'flac'];

  const processFiles = async (files: File[], source: 'evidence' | 'complaint-intake' = 'evidence') => {
    setError(null);

    const uploads = files.map((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const allowedExtensions = source === 'complaint-intake' ? COMPLAINT_INTAKE_EXTENSIONS : ALLOWED_EXTENSIONS;
      if (!allowedExtensions.includes(ext)) {
        setError(`Unsupported file type: ${file.name}`);
        return Promise.resolve(null);
      }
      return uploadFile(file, source);
    });

    await Promise.all(uploads);
  };

  const uploadFile = async (file: File, source: 'evidence' | 'complaint-intake' = 'evidence') => {
    const fileId = `${file.name}-${file.size}-${Date.now()}`;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isImage = file.type.startsWith('image/');

    // Push initial status
    setUploadProgressQueue((prev) => ({
      ...prev,
      [fileId]: {
        fileName: file.name,
        progress: 0,
        status: 'uploading',
        tempUrl: isImage ? URL.createObjectURL(file) : undefined,
        size: file.size,
        source,
      },
    }));

    return new Promise<UploadedFile | null>((resolve) => {
      const finishWithError = (message: string) => {
        setUploadProgressQueue((prev) => {
          if (!prev[fileId]) return prev;
          return {
            ...prev,
            [fileId]: {
              ...prev[fileId],
              status: 'error',
              error: message,
            },
          };
        });
        resolve(null);
      };

      apiClient.post(API_ROUTES.COMPLAINTS.UPLOAD_SIGNATURE)
        .then((sigRes) => {
          const { signature, timestamp, apiKey, cloudName, folder, publicId } = sigRes.data.data;

          const formData = new FormData();
          formData.append('file', file);
          formData.append('api_key', apiKey);
          formData.append('timestamp', String(timestamp));
          formData.append('signature', signature);
          formData.append('folder', folder);
          formData.append('public_id', publicId);

          let resourceType = 'image';
          if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
            resourceType = 'video';
          } else if (file.type.includes('pdf') || file.name.endsWith('.pdf') || !file.type.startsWith('image/')) {
            resourceType = 'raw';
          }

          const xhr = new XMLHttpRequest();
          xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, true);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              setUploadProgressQueue((prev) => {
                if (!prev[fileId]) return prev;
                return {
                  ...prev,
                  [fileId]: { ...prev[fileId], progress: percent },
                };
              });
            }
          };

          xhr.onload = () => {
            if (xhr.status === 200) {
              const response = JSON.parse(xhr.responseText);
              const uploadedItem: UploadedFile = {
                publicId: response.public_id,
                secureUrl: response.secure_url,
                resourceType: response.resource_type,
                mimeType: file.type || 'application/octet-stream',
                originalFilename: file.name,
                extension: ext,
                size: response.bytes,
                source,
              };

              setEvidenceFiles((prev) => [...prev, uploadedItem]);
              setUploadProgressQueue((prev) => {
                const next = { ...prev };
                next[fileId] = { ...next[fileId], status: 'success', progress: 100 };
                return next;
              });
              resolve(uploadedItem);
            } else {
              finishWithError(`Upload failed: HTTP ${xhr.status}`);
            }
          };

          xhr.onerror = () => {
            finishWithError('Network connection error.');
          };

          xhr.send(formData);
        })
        .catch((err) => {
          console.error(err);
          finishWithError(err.response?.data?.message || err.message || 'Signature error.');
        });
    });
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

  // Normalize a raw LLM category string to one of the known enum values.
  const normalizeCategory = (raw: string): string => {
    const upper = raw.toUpperCase().replace(/[\s\-]+/g, '_').replace(/[^A-Z_]/g, '');
    // Exact match first
    if (categories.some((c) => c.value === upper)) return upper;
    // Label match
    const byLabel = categories.find(
      (c) => c.label.toUpperCase() === raw.toUpperCase() ||
             c.label.toUpperCase().replace(/\s+/g, '_') === upper
    );
    if (byLabel) return byLabel.value;
    // Partial / keyword match (e.g. "cyber crime" → CYBERCRIME)
    const byPartial = categories.find((c) =>
      upper.includes(c.value) || c.value.includes(upper)
    );
    return byPartial ? byPartial.value : raw.trim();
  };

  // Normalize a time string from LLM (e.g. "2:30 PM", "14:30", "night") into
  // either an HH:MM string for the exact-time input or a period keyword.
  const normalizeTime = (raw: string): { period: string; exact: string } => {
    const lower = raw.trim().toLowerCase();
    const broadPeriods = ['morning', 'afternoon', 'evening', 'night', 'unknown'];
    if (broadPeriods.includes(lower)) return { period: lower, exact: '' };

    // Try to parse a 12-hour time like "2:30 PM" or "2 PM"
    const match12 = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (match12) {
      let hours = parseInt(match12[1], 10);
      const minutes = parseInt(match12[2] ?? '0', 10);
      const meridiem = match12[3];
      if (meridiem === 'pm' && hours !== 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      return {
        period: 'exact',
        exact: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      };
    }

    // Already HH:MM or HH:MM:SS
    const match24 = lower.match(/^(\d{1,2}):(\d{2})/);
    if (match24) {
      return {
        period: 'exact',
        exact: `${match24[1].padStart(2, '0')}:${match24[2]}`,
      };
    }

    // Fallback: treat as approximate period if it matches loosely
    for (const p of broadPeriods) {
      if (lower.includes(p)) return { period: p, exact: '' };
    }

    // Give up — keep as-is and let user fix
    return { period: 'exact', exact: raw.trim() };
  };

  const applyComplaintDraft = (draft: ComplaintDraftResponse | null | undefined) => {
    if (!draft?.prefill) return;

    const prefill = draft.prefill;

    if (prefill.shortDescription?.trim()) {
      setShortDescription(prefill.shortDescription.trim());
    }
    if (prefill.detailedDescription?.trim()) {
      setDetailedDescription(prefill.detailedDescription.trim());
    }
    if (prefill.incidentDate?.trim()) {
      setIncidentDate(prefill.incidentDate.trim());
    }
    if (prefill.incidentTime?.trim()) {
      const { period, exact } = normalizeTime(prefill.incidentTime.trim());
      setTimePeriod(period);
      setIncidentTime(exact);
    }
    if (prefill.incidentPlace?.trim()) {
      setIncidentPlace(prefill.incidentPlace.trim());
    }
    if (prefill.approximateDateText?.trim()) {
      setIsApproximateDate(true);
      setApproximateDateText(prefill.approximateDateText.trim());
    }
    if (prefill.coordinates?.trim()) {
      setCoordinates(prefill.coordinates.trim());
    }
    if (prefill.address?.trim()) {
      setIncidentPlace(prefill.address.trim());
    }
    if (prefill.category?.trim()) {
      setCategory(normalizeCategory(prefill.category.trim()));
    }
  };


  const processComplaintIntake = async (files: File[]) => {
    if (files.length === 0) return;

    setIsComplaintIntakeProcessing(true);
    setIntakeStatusMessage('Processing complaint media for auto-fill...');

    try {
      const intakeUploadPromise = processFiles(files, 'complaint-intake');
      const intakeAnalysisPromise = (async () => {
        const formData = new FormData();
        formData.append('text', `${shortDescription}\n${detailedDescription}`.trim());
        formData.append('context', JSON.stringify({
          shortDescription,
          detailedDescription,
          incidentDate,
          incidentTime,
          incidentPlace,
          approximateDateText,
          coordinates,
          address: incidentPlace,
          category,
        }));

        files.forEach((file) => formData.append('files', file));

        return apiClient.post(API_ROUTES.COMPLAINTS.INTAKE_ANALYZE, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      })();

      const analysisResponse = await intakeAnalysisPromise;
      await intakeUploadPromise;

      console.log('[complaint-intake] raw API response:', JSON.stringify(analysisResponse.data, null, 2));
      const payload = (analysisResponse.data?.data ?? analysisResponse.data) as ComplaintDraftResponse;
      console.log('[complaint-intake] payload to apply:', JSON.stringify(payload, null, 2));
      applyComplaintDraft(payload);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Complaint media processing failed. You can continue and fill the form manually.');
    } finally {
      setIsComplaintIntakeProcessing(false);
      setIntakeStatusMessage('');
    }
  };

  const handleRemoveEvidence = (index: number) => {
    setEvidenceFiles((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const handleRemoveProgress = (fileId: string) => {
    setUploadProgressQueue((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
  };

  // ─── Step Validation & Progress ───────────────────────────────────────────
  const validateStep1 = () => {
    if (!complainantVerified) return 'Please verify the complainant email with the OTP sent to them first';
    if (!complainantFirstName.trim()) return 'Complainant first name is required';
    if (!complainantLastName.trim()) return 'Complainant last name is required';
    if (!complainantEmail.trim()) return 'Complainant email is required';
    if (!complainantPhone.trim()) return 'Complainant phone number is required';
    if (!complainantDob) return 'Complainant date of birth is required';
    if (!complainantAddress.trim()) return 'Complainant address is required';
    if (!complainantCity.trim()) return 'Complainant city is required';
    if (!complainantDistrict.trim()) return 'Complainant district is required';
    if (!complainantState.trim()) return 'Complainant state is required';
    if (!complainantPincode.trim()) return 'Complainant pincode is required';
    if (!complainantIdProofNumber.trim()) return 'Identity proof number is required';
    return null;
  };

  const validateStep2 = () => {
    if (!shortDescription.trim()) return 'Complaint Title is required';
    if (shortDescription.trim().length < 5 || shortDescription.trim().length > 255) {
      return 'Complaint Title must be between 5 and 255 characters';
    }

    if (isApproximateDate) {
      if (!approximateDateText.trim()) return 'Approximate Date description is required';
      if (!incidentDate) return 'Estimated date is required to map timeline index';
    } else {
      if (!incidentDate) return 'Incident Date is required';
      if (new Date(incidentDate) > new Date()) return 'Incident Date cannot be in the future';
    }

    if (timePeriod === 'exact' && !incidentTime) {
      return 'Please specify exact incident time or select a general time period';
    }

    if (!incidentPlace.trim()) return 'Incident location is required. Drop pin on map or search address';
    if (detailedDescription.trim().length < 10) {
      return 'Detailed Description must be at least 10 characters';
    }
    return null;
  };

  const handleNext = async () => {
    setError(null);
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
      
      setSubmitting(true);
      try {
        const res = await apiClient.post(API_ROUTES.AUTH.COMPLAINANT_PROFILE, {
          firstName: complainantFirstName,
          middleName: '',
          lastName: complainantLastName,
          email: complainantEmail,
          phone: complainantPhone,
          dateOfBirth: complainantDob,
          gender: complainantGender,
          address: complainantAddress,
          city: complainantCity,
          district: complainantDistrict,
          state: complainantState,
          pincode: complainantPincode,
          idProofType: complainantIdProofType,
          idProofNumber: complainantIdProofNumber,
        });
        setComplainantId(res.data.data?.id || res.data.data?._id || '');
        setStep(2);
      } catch (err: any) {
        const errMsg = err.response?.data?.details 
          ? `${err.response.data.message}: ${err.response.data.details.map((d: any) => d.message).join(', ')}` 
          : err.response?.data?.message || 'Could not save complainant profile.';
        setError(errMsg);
      } finally {
        setSubmitting(false);
      }
    } else if (step === 2) {
      if (isComplaintIntakeProcessing) {
        setError('Please wait for complaint media processing to finish');
        return;
      }
      const err = validateStep2();
      if (err) { setError(err); return; }
      setStep(3);
    } else if (step === 3) {
      // Check if files are still uploading
      const isUploading = Object.values(uploadProgressQueue).some((item) => item.status === 'uploading');
      if (isUploading) {
        setError('Please wait for evidence files to finish uploading');
        return;
      }
      setStep(4);
    }
  };

  const handlePrev = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
  };

  // ─── Submission Logic ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!declareCheck) {
      setError('You must accept the legal declaration before submitting');
      return;
    }

    setSubmitting(true);
    setSubmitStatus('Submitting case details and evidence...');

    try {
      let finalTime = incidentTime;
      if (timePeriod !== 'exact') {
        finalTime = timePeriod.charAt(0).toUpperCase() + timePeriod.slice(1);
      }

      const payload = {
        incidentDate,
        incidentTime: finalTime || undefined,
        approximateDateText: isApproximateDate ? approximateDateText : undefined,
        incidentPlace,
        coordinates: coordinates || undefined,
        address: incidentPlace,
        category: category || undefined,
        shortDescription,
        detailedDescription,
        complainantUserId: complainantId || undefined,
        policeStation: selectedStation?._id || undefined,
        evidence: evidenceFiles,
      };

      await apiClient.post(API_ROUTES.COMPLAINTS.CREATE, payload);
      router.push(APP_ROUTES.MY_COMPLAINTS);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Failed to submit complaint. Please check fields and try again.'
      );
    } finally {
      setSubmitting(false);
      setSubmitStatus('');
    }
  };

  // Helper file icons
  const getFileIcon = (mime: string, ext: string) => {
    const checkExt = ext.toLowerCase();
    if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(checkExt)) {
      return <Eye className="h-6 w-6 text-blue-500" />;
    }
    if (mime.startsWith('video/') || ['mp4', 'mpeg', 'mov', 'avi'].includes(checkExt)) {
      return <Film className="h-6 w-6 text-purple-500" />;
    }
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(checkExt)) {
      return <Music className="h-6 w-6 text-teal-500" />;
    }
    if (mime.includes('pdf') || checkExt === 'pdf') {
      return <FileText className="h-6 w-6 text-red-500" />;
    }
    return <FileText className="h-6 w-6 text-neutral-500" />;
  };

  const handleSendOtpOnly = async () => {
    if (!complainantEmail.trim()) {
      setError('Please enter an email address first.');
      return;
    }
    setOtpSubmitting(true);
    setError(null);
    try {
      await apiClient.post(API_ROUTES.AUTH.SEND_OTP, { email: complainantEmail });
      setOtpSent(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not send OTP.');
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleVerifyOtpOnly = async () => {
    if (!otpCode.trim()) {
      setError('Please enter the OTP sent to the complainant email.');
      return;
    }
    setOtpSubmitting(true);
    setError(null);
    try {
      await apiClient.post(API_ROUTES.AUTH.VERIFY_PRE_OTP, { email: complainantEmail, otp: otpCode });
      setComplainantVerified(true);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid OTP. Please try again.');
    } finally {
      setOtpSubmitting(false);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="flex items-center gap-4 border-b border-border pb-4">
        <button
          onClick={() => router.push(APP_ROUTES.MY_COMPLAINTS)}
          className="p-2 hover:bg-surface-elevated rounded-xl transition-all duration-200"
          title="Back to complaints list"
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </button>
        <div>
          <h1 className="text-3xl font-heading font-extrabold tracking-tight text-text-primary">E-Complaint Intake Portal</h1>
          <p className="text-sm text-text-secondary font-medium">File a secure case description with the Gujarat Police Department</p>
        </div>
      </div>

      {/* Modern Stepper Indicator */}
      <div className="grid grid-cols-4 gap-3 bg-surface border border-border rounded-2xl p-4 shadow-card glass">
        {[
          { num: 1, name: 'Complainant' },
          { num: 2, name: 'Complaint' },
          { num: 3, name: 'Evidence' },
          { num: 4, name: 'Review' }
        ].map((s) => (
          <div key={s.num} className="flex flex-col md:flex-row items-center gap-2.5 px-2 text-center md:text-left">
            <span
              className={[
                'flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold transition-all duration-300 shadow-sm',
                step === s.num
                  ? 'bg-brand-primary text-white ring-4 ring-brand-primary/20 scale-105 shadow-glow-sm'
                  : step > s.num
                    ? 'bg-semantic-success text-white'
                    : 'bg-surface-elevated text-text-secondary border border-border'
              ].join(' ')}
            >
              {step > s.num ? <Check size={15} /> : s.num}
            </span>
            <span
              className={[
                'text-xs font-heading select-none hidden md:inline transition-colors duration-200',
                step === s.num ? 'text-brand-primary font-bold' : step > s.num ? 'text-semantic-success font-semibold' : 'text-text-secondary font-medium'
              ].join(' ')}
            >
              {s.name}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-lg text-sm shadow-sm animate-shake">
          <ShieldAlert size={20} className="flex-shrink-0 text-red-600" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {submitting && submitStatus && (
        <div className="flex items-center gap-3 p-4 bg-primary-50 border-l-4 border-primary-500 text-primary-800 rounded-r-lg text-sm shadow-sm animate-pulse">
          <Loader2 size={18} className="animate-spin flex-shrink-0" />
          <span className="font-medium">{submitStatus}</span>
        </div>
      )}

      {/* ─── Step 1: Complainant profile & OTP ─── */}
      {step === 1 && (
        <Card className="space-y-6 p-6 border border-border">
          <div className="border-b border-border pb-3">
            <h2 className="text-xl font-bold text-text-primary">Step 1: Complainant details</h2>
            <p className="text-sm text-text-secondary">Capture the complainant profile and verify their email before filing the case.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-4 space-y-4 mb-2">
              <div className="flex flex-wrap items-center gap-3">
                <MailCheck className="h-5 w-5 text-brand-primary" />
                <div>
                  <p className="text-sm font-bold text-text-primary">Email verification for the complainant</p>
                  <p className="text-xs text-text-secondary font-medium mt-0.5">Please provide the complainant's email and verify it with the OTP before continuing.</p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row items-end gap-4">
                <div className="flex-1 w-full">
                  <Input label="Email" type="email" value={complainantEmail} onChange={(e) => setComplainantEmail(e.target.value)} placeholder="complainant@example.com" disabled={complainantVerified} required />
                </div>
                {!complainantVerified && (
                  <Button type="button" onClick={handleSendOtpOnly} isLoading={otpSubmitting} className="font-bold">
                    {otpSent ? 'Resend OTP' : 'Send OTP'}
                  </Button>
                )}
              </div>
              
              {otpSent && !complainantVerified && (
                <div className="flex flex-col md:flex-row items-end gap-4 pt-2">
                  <div className="flex-1 w-full">
                    <Input label="Enter OTP" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="6-digit OTP" />
                  </div>
                  <Button type="button" onClick={handleVerifyOtpOnly} isLoading={otpSubmitting} className="font-bold">
                    Verify OTP
                  </Button>
                </div>
              )}
              
              {complainantVerified && (
                <div className="flex items-center gap-2 text-sm font-bold text-semantic-success mt-2">
                  <BadgeCheck className="h-4 w-4" />
                  Complainant email verified successfully. You can now fill in the rest of the details.
                </div>
              )}
            </div>

            {complainantVerified && (
              <>
                <Input label="First Name" value={complainantFirstName} onChange={(e) => setComplainantFirstName(e.target.value)} placeholder="e.g. Priya" required />
                <Input label="Last Name" value={complainantLastName} onChange={(e) => setComplainantLastName(e.target.value)} placeholder="e.g. Sharma" required />
                <Input label="Phone" value={complainantPhone} onChange={(e) => setComplainantPhone(e.target.value)} placeholder="10-digit mobile number" required />
                <Input label="Date of Birth" type="date" value={complainantDob} onChange={(e) => setComplainantDob(e.target.value)} required />
                <Select label="Gender" value={complainantGender} onChange={(e) => setComplainantGender(e.target.value)} options={[{value:'MALE',label:'Male'},{value:'FEMALE',label:'Female'},{value:'OTHER',label:'Other'}]} required />
                <Input label="Address" value={complainantAddress} onChange={(e) => setComplainantAddress(e.target.value)} placeholder="Flat / House / Street" required />
                <Input label="City" value={complainantCity} onChange={(e) => setComplainantCity(e.target.value)} placeholder="Ahmedabad" required />
                <Input label="District" value={complainantDistrict} onChange={(e) => setComplainantDistrict(e.target.value)} placeholder="Ahmedabad" required />
                <Input label="State" value={complainantState} onChange={(e) => setComplainantState(e.target.value)} placeholder="Gujarat" required />
                <Input label="Pincode" value={complainantPincode} onChange={(e) => setComplainantPincode(e.target.value)} placeholder="380001" required />
                <Select
                  label="ID Proof Type"
                  value={complainantIdProofType}
                  onChange={(e) => setComplainantIdProofType(e.target.value)}
                  options={[
                    { value: 'AADHAAR', label: 'Aadhaar' },
                    { value: 'PAN', label: 'PAN' },
                    { value: 'DRIVING_LICENSE', label: 'Driving License' },
                    { value: 'VOTER_ID', label: 'Voter ID' },
                  ]}
                  required
                />
                <Input label="ID Proof Number" value={complainantIdProofNumber} onChange={(e) => setComplainantIdProofNumber(e.target.value)} placeholder="1234 5678 9012" required />
              </>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <Button onClick={handleNext} rightIcon={<ArrowRight size={16} />} className="font-bold">
              Continue to Complaint Details
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Step 2: Incident specifics ─── */}
      {step === 2 && (
        <Card className="space-y-6 p-6 border border-border">
          <div className="border-b border-border pb-3">
            <h2 className="text-xl font-bold text-text-primary">Step 2: Complaint details</h2>
            <p className="text-sm text-text-secondary">Provide dates, general timing, exact coordinates, and jurisdictional area.</p>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-4 space-y-3">
              <div>
                <p className="text-sm font-bold text-text-primary">Optional complaint media intake</p>
                <p className="text-xs text-text-secondary font-medium mt-0.5">
                  Upload images, PDFs, or audio recordings to auto-fill the complaint fields. The uploaded files will also remain part of the complaint evidence.
                </p>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) {
                    void processComplaintIntake(Array.from(e.dataTransfer.files));
                  }
                }}
                onClick={() => document.getElementById('complaint-intake-input')?.click()}
                className={[
                  'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 bg-input-bg',
                  isDragging
                    ? 'border-brand-primary bg-brand-primary/10 scale-[0.99] shadow-inner'
                    : 'border-border hover:border-brand-primary hover:bg-brand-primary/5',
                ].join(' ')}
              >
                <input
                  type="file"
                  id="complaint-intake-input"
                  className="hidden"
                  multiple
                  accept="image/*,audio/*,.pdf"
                  onChange={(e) => {
                    if (e.target.files) {
                      void processComplaintIntake(Array.from(e.target.files));
                      e.target.value = '';
                    }
                  }}
                />
                <Upload size={30} className="mx-auto text-brand-primary mb-2" />
                <p className="text-sm font-semibold text-text-primary">
                  Drag &amp; drop complaint media here, or <span className="text-brand-primary font-bold">browse files</span>
                </p>
                <p className="text-xs text-text-secondary mt-1.5 font-medium">
                  These files are processed for OCR, Florence captions, and Whisper transcription before you continue.
                </p>
              </div>

              {isComplaintIntakeProcessing && (
                <div className="flex items-center gap-2 text-xs font-semibold text-brand-primary">
                  <Loader2 size={14} className="animate-spin" />
                  {intakeStatusMessage || 'Processing complaint media...'}
                </div>
              )}
            </div>

            {/* Title / Summary */}
            <Input
              label="Complaint Title"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="e.g. Someone stole my bike / OTP Fraud transaction / Lost mobile phone"
              maxLength={255}
              required
            />

            {/* Date Specifics */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">Incident Date Selection *</span>
                <label className="flex items-center gap-2 text-xs font-bold text-brand-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isApproximateDate}
                    onChange={(e) => {
                      setIsApproximateDate(e.target.checked);
                      if (!e.target.checked) setApproximateDateText('');
                    }}
                    className="rounded border-border bg-input-bg text-brand-primary focus:ring-brand-primary"
                  />
                  I only know the Approximate Date
                </label>
              </div>

              {isApproximateDate ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Describe Approximate Date"
                    value={approximateDateText}
                    onChange={(e) => setApproximateDateText(e.target.value)}
                    placeholder="e.g. Around last Monday / About two weeks ago"
                    required
                  />
                  <Input
                    type="date"
                    label="Estimated Date on Calendar (AI Indexing)"
                    value={incidentDate}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setIncidentDate(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div>
                  <Input
                    type="date"
                    label="Exact Incident Date"
                    value={incidentDate}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setIncidentDate(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>

            {/* Time Specifics */}
            <div className="bg-surface border border-border rounded-xl p-4 space-y-4 shadow-sm">
              <label className="block text-sm font-semibold text-text-primary">Approximate Time Period</label>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  { value: 'morning', label: 'Morning' },
                  { value: 'afternoon', label: 'Afternoon' },
                  { value: 'evening', label: 'Evening' },
                  { value: 'night', label: 'Night' },
                  { value: 'unknown', label: 'Unknown' },
                  { value: 'exact', label: 'Exact Time' }
                ].map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setTimePeriod(t.value);
                      if (t.value !== 'exact') setIncidentTime('');
                    }}
                    className={[
                      'px-3 py-2 rounded-lg text-xs font-semibold border transition-all duration-200',
                      timePeriod === t.value
                        ? 'bg-brand-primary/15 border-brand-primary text-brand-primary shadow-sm font-bold'
                        : 'bg-input-bg border-border text-text-secondary hover:bg-surface-elevated'
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {timePeriod === 'exact' && (
                <div className="mt-2">
                  <Input
                    type="time"
                    label="Exact Time"
                    value={incidentTime}
                    onChange={(e) => setIncidentTime(e.target.value)}
                    required
                  />
                </div>
              )}
            </div>

            {/* Location & Map UI */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-text-primary">Incident Location *</label>
              
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search address (e.g. Kalupur station, Maninagar)..."
                    value={searchAddressQuery}
                    onChange={(e) => setSearchAddressQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchAddress(); } }}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-neutral-800 rounded-lg outline-none focus:ring-2 focus:ring-brand-primary bg-input-bg text-text-primary"
                  />
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-secondary" />
                </div>
                <Button type="button" variant="ghost" onClick={handleSearchAddress} isLoading={searchingAddress}>
                  Search
                </Button>
                <Button type="button" variant="secondary" onClick={handleDetectLocation} leftIcon={<MapPin size={16} />}>
                  Detect Location
                </Button>
              </div>

              {/* Coordinates display info */}
              {coordinates && (
                <p className="text-xs text-neutral-500 font-mono">
                  Coordinates: {coordinates} (Captured Automatically)
                </p>
              )}

              {/* Map element */}
              <div className="relative border border-neutral-800 rounded-xl overflow-hidden shadow-sm bg-input-bg">
                <div ref={mapContainerRef} id="leaflet-map-element" className="h-[280px] w-full z-0" />
                {!mapLoaded && !mapError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-surface/80 z-10">
                    <Loader2 className="animate-spin text-brand-primary mr-2" />
                    <span className="text-xs font-semibold text-text-secondary">Initializing Interactive Map...</span>
                  </div>
                )}
                {mapError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/90 text-danger-700 z-10 px-4 text-center">
                    <p className="text-sm font-medium">Failed to load Map layer. Geolocation coordinates remain functional.</p>
                  </div>
                )}
              </div>

              {/* Place details display */}
              <Input
                label="Confirm Place / Location of Occurrence *"
                value={incidentPlace}
                onChange={(e) => setIncidentPlace(e.target.value)}
                placeholder="Selected address (detect, search, or drop pin above to populate)"
                required
              />

              <div className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 p-4 text-sm text-text-secondary">
                <p className="font-semibold text-text-primary">Police Station Assignment</p>
                <p>
                  Your assigned police station will be selected automatically from your officer profile when the complaint is submitted.
                </p>
              </div>
            </div>

            {/* Description Narrative */}
            <div className="bg-surface border border-neutral-800 rounded-lg p-4 space-y-4">
              <label className="block text-sm font-semibold text-text-primary">Detailed Narrative Description *</label>
              <textarea
                value={detailedDescription}
                onChange={(e) => setDetailedDescription(e.target.value)}
                placeholder="Provide a comprehensive account of the incident. Include relevant dates, times, individuals involved, specific sequences of events, and any descriptive details that will assist in the investigation."
                className="w-full p-4 rounded-xl border border-neutral-800 min-h-[260px] text-sm focus:ring-2 focus:ring-brand-primary outline-none transition-all resize-none shadow-sm text-text-primary bg-input-bg"
              />

              <div className="flex flex-col md:flex-row items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsRecordingUIActive(true)}
                  leftIcon={<Mic size={16} />}
                >
                  Record Voice
                </Button>
                <span className="text-xs text-neutral-400 font-medium">Prepares speech recorder UI placeholder</span>
              </div>

              <div
                className={[
                  'rounded-xl border border-brand-primary/20 bg-brand-primary/10 text-text-primary space-y-3 p-4 transition-all duration-500',
                  detailedDescription.length > 0 ? 'opacity-60 pointer-events-none' : 'opacity-100'
                ].join(' ')}
              >
                <div className="flex items-center gap-2 border-b border-brand-primary/20 pb-2">
                  <HelpCircle size={16} className="text-brand-primary" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Helpful Writing Tips</h4>
                </div>
                <p className="text-xs leading-relaxed text-text-secondary">
                  Consider detailing:
                </p>
                <ul className="text-xs space-y-1.5 list-disc pl-4 text-text-secondary">
                  <li>What exactly took place?</li>
                  <li>Where was the location of crime?</li>
                  <li>When did it occur?</li>
                  <li>Who was involved or suspected?</li>
                  <li>What property or money was lost?</li>
                  <li>Are there witnesses or CCTV?</li>
                </ul>
              </div>
            </div>

            {/* Optional category */}
            <div className="border border-neutral-800 bg-surface rounded-lg p-4 space-y-2">
              <Select
                label="Complaint Category (Optional)"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={[{ value: '', label: 'Select Category (Optional)' }, ...categories]}
              />
              <p className="text-xs text-text-secondary font-medium">
                If you&apos;re unsure, leave this blank. AI will identify the complaint category.
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-neutral-800">
            <Button variant="ghost" onClick={handlePrev} leftIcon={<ArrowLeft size={16} />}>
              Back to Complainant
            </Button>
            <Button onClick={handleNext} rightIcon={<ArrowRight size={16} />} disabled={isComplaintIntakeProcessing}>
              Continue to Evidence
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Step 3: Evidence uploads ─── */}
      {step === 3 && (
        <Card className="space-y-6 p-6 border border-neutral-800">
          <div className="border-b border-neutral-800 pb-3">
            <h2 className="text-xl font-bold text-text-primary">Step 3: Upload Evidence</h2>
            <p className="text-sm text-text-secondary">Provide supporting files for the complaint record. Supported formats: Images, Videos, Audio, PDF, Documents, ZIP.</p>
          </div>

          {/* Drag & drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) {
                void processFiles(Array.from(e.dataTransfer.files), 'evidence');
              }
            }}
            onClick={() => document.getElementById('evidence-select-input')?.click()}
            className={[
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
              isDragging
                ? 'border-brand-primary bg-brand-primary/10 scale-[0.99] shadow-inner'
                : 'border-neutral-800 hover:border-brand-primary bg-input-bg hover:bg-surface'
            ].join(' ')}
          >
            <input
              type="file"
              id="evidence-select-input"
              className="hidden"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip,.txt"
              onChange={(e) => {
                if (e.target.files) {
                  void processFiles(Array.from(e.target.files), 'evidence');
                  e.target.value = '';
                }
              }}
            />
            <Upload size={36} className="mx-auto text-text-secondary mb-3" />
            <p className="text-sm font-semibold text-text-primary">
              Drag &amp; drop evidence files here, or{' '}
              <span className="text-brand-primary hover:underline font-bold">browse files</span>
            </p>
            <p className="text-xs text-text-secondary mt-1.5">
              Files upload instantly to Cloudinary storage for review
            </p>
          </div>
          
          <div className="flex justify-center mt-2">
            <Button type="button" variant="secondary" onClick={() => setIsPhysicalModalOpen(true)}>
              + Add Physical / Hardware Evidence
            </Button>
          </div>

          {/* Upload progress & completed cards */}
          {(Object.keys(uploadProgressQueue).length > 0 || evidenceFiles.length > 0) && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Upload List ({evidenceFiles.length}/{evidenceFiles.length + Object.keys(uploadProgressQueue).filter(k=>uploadProgressQueue[k].status==='uploading').length} Ready)
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Upload queue list */}
                {Object.entries(uploadProgressQueue).map(([fileId, item]) => {
                  if (item.status === 'success') return null; // Displayed below in completed
                  const ext = item.fileName.split('.').pop()?.toUpperCase() ?? '';
                  return (
                    <div key={fileId} className="flex items-center gap-3 p-3 bg-input-bg border border-neutral-800 rounded-lg shadow-sm relative">
                      {item.tempUrl ? (
                        <img src={item.tempUrl} className="h-10 w-10 object-cover rounded flex-shrink-0" alt="" />
                      ) : (
                        <div className="h-10 w-10 bg-surface rounded flex items-center justify-center flex-shrink-0">
                          <FileText className="h-5 w-5 text-text-secondary" />
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-text-primary truncate" title={item.fileName}>
                          {item.fileName}
                        </p>
                        <p className="text-[10px] text-text-secondary">
                          {(item.size / (1024 * 1024)).toFixed(2)} MB · {ext}
                        </p>
                        {item.source === 'complaint-intake' && (
                          <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider bg-brand-primary/20 text-brand-primary px-2 py-0.5 rounded-full">
                            Complaint Intake Evidence
                          </span>
                        )}

                        {item.status === 'uploading' && (
                          <div className="w-full bg-neutral-800 h-1 rounded-full mt-2 overflow-hidden">
                            <div className="bg-brand-primary h-full transition-all duration-300" style={{ width: `${item.progress}%` }} />
                          </div>
                        )}
                        {item.status === 'error' && (
                          <span className="text-[10px] font-semibold text-semantic-critical mt-1 block truncate">
                            {item.error || 'Upload error'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-text-secondary font-semibold">{item.progress}%</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveProgress(fileId)}
                          className="p-1 text-text-secondary hover:text-text-primary hover:bg-neutral-800 rounded"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Already uploaded evidence list */}
                {evidenceFiles.map((file, idx) => (
                  <div key={file.publicId} className="flex items-center gap-3 p-3 bg-input-bg border border-neutral-800 rounded-lg shadow-sm relative group">
                    <div className="h-10 w-10 bg-surface rounded flex items-center justify-center flex-shrink-0 border border-neutral-700">
                      {file.resourceType === 'image' ? (
                        <img src={file.secureUrl} className="h-10 w-10 object-cover rounded" alt="" />
                      ) : (
                        getFileIcon(file.mimeType, file.extension)
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary truncate" title={file.originalFilename}>
                        {file.originalFilename}
                      </p>
                      <p className="text-[10px] text-text-secondary">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB · {file.extension.toUpperCase()}
                      </p>
                      <span className="text-[9px] font-bold text-green-500 flex items-center gap-1 mt-0.5">
                        <Check size={10} /> Cloudinary Safe
                      </span>
                      {file.isPhysical && (
                        <span className="inline-block bg-brand-primary/20 text-brand-primary text-[9px] px-2 py-0.5 rounded-full mt-1 font-bold">
                          PHYSICAL EVIDENCE
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-neutral-800 rounded border border-transparent hover:border-neutral-700"
                        title="Preview"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveEvidence(idx)}
                        className="p-1.5 text-text-secondary hover:text-red-500 hover:bg-red-500/10 rounded border border-transparent hover:border-red-500/30"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t border-neutral-800">
            <Button variant="ghost" onClick={handlePrev} leftIcon={<ArrowLeft size={16} />}>
              Back to Complaint
            </Button>
            <Button onClick={handleNext} rightIcon={<ArrowRight size={16} />}>
              Continue to Review
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Step 4: Review & Submission ─── */}
      {step === 4 && (
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-8 animate-fade-in text-text-primary">
          {/* Header Banner */}
          <div className="bg-surface text-text-primary rounded-2xl p-6 shadow flex items-center justify-between gap-4 border border-neutral-800">
            <div className="space-y-1.5">
              <h2 className="text-xl font-extrabold tracking-tight">Review &amp; Submit Your Complaint</h2>
              <p className="text-xs text-text-secondary leading-relaxed">
                Please double-check all details below. Your story will be securely transmitted to Gujarat Police for immediate review.
              </p>
            </div>
            <div className="h-12 w-12 bg-brand-primary/10 rounded-full flex items-center justify-center border border-brand-primary/20 shadow-inner flex-shrink-0">
              <ShieldAlert className="text-brand-primary h-6 w-6" />
            </div>
          </div>

          {/* 1. Incident details Card */}
          <div className="bg-input-bg border border-neutral-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-surface border-b border-neutral-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-brand-primary/10 rounded-lg text-brand-primary border border-brand-primary/20">
                  <Calendar size={18} />
                </div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">1. Incident Specifications</h3>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-bold text-brand-primary hover:text-blue-200 flex items-center gap-1 bg-input-bg border border-neutral-700 hover:border-neutral-600 px-3 py-1.5 rounded-lg shadow-sm transition-all duration-200 active:scale-[0.98]"
              >
                Modify Details
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Complaint Title Block */}
              <div>
                <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest">Complaint Title</span>
                <h4 className="text-lg font-extrabold text-text-primary mt-1">{shortDescription}</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 border-t border-neutral-800 pt-6">
                <div>
                  <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest">Incident Date</span>
                  <p className="font-semibold text-text-primary mt-1.5 text-sm">
                    {isApproximateDate ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="text-brand-primary font-bold">{approximateDateText}</span>
                        <span className="text-xs text-text-secondary font-medium">(Estimated Date: {new Date(incidentDate).toLocaleDateString('en-IN')})</span>
                      </span>
                    ) : (
                      new Date(incidentDate).toLocaleDateString('en-IN')
                    )}
                  </p>
                </div>

                <div>
                  <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest">Timing</span>
                  <p className="font-bold text-text-primary mt-1.5 text-sm flex items-center gap-1.5">
                    <Clock size={14} className="text-text-secondary" />
                    {timePeriod === 'exact' ? incidentTime : timePeriod.charAt(0).toUpperCase() + timePeriod.slice(1)}
                  </p>
                </div>
              </div>

              {/* Location and Station Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 border-t border-neutral-800 pt-6">
                <div>
                  <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest">Incident Location</span>
                  <p className="font-semibold text-text-primary mt-1.5 text-sm leading-relaxed">{incidentPlace}</p>
                  {coordinates && (
                    <span className="inline-block mt-2 font-mono text-[10px] text-text-secondary bg-surface border border-neutral-800 px-2 py-0.5 rounded">
                      GPS: {coordinates}
                    </span>
                  )}
                </div>

                <div>
                  <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest">Assigned Police Station</span>
                  <div className="mt-1.5">
                    <div className="flex items-center gap-2">
                      <p className="font-extrabold text-text-primary text-sm">
                        {selectedStation?.name || 'Automatically assigned on submission'}
                      </p>
                      {selectedStation && (
                        <span className="text-[9px] font-extrabold bg-green-500/20 border border-green-500/30 text-green-500 px-2 py-0.5 rounded-full select-none uppercase tracking-wide flex items-center gap-0.5">
                          <Check size={8} /> Auto-Mapped
                        </span>
                      )}
                    </div>
                    {selectedStation ? (
                      <p className="text-xs text-text-secondary mt-1 font-medium leading-relaxed">
                        Station Code: {selectedStation.code} <br />
                        Jurisdiction: {selectedStation.city}, {selectedStation.district}
                      </p>
                    ) : (
                      <p className="text-xs text-text-secondary mt-1 font-medium leading-relaxed">
                        Your officer profile will provide the assigned station when the complaint is created.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {category && (
                <div className="border-t border-neutral-800 pt-6">
                  <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-widest">Selected Category (Optional)</span>
                  <span className="inline-block bg-brand-primary/10 text-brand-primary px-3 py-1 text-xs font-bold rounded-lg mt-2 border border-brand-primary/30 shadow-sm">
                    {category}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 2. Narrative Section */}
          <div className="bg-input-bg border border-neutral-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-surface/50 border-b border-neutral-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-brand-primary/10 rounded-lg text-brand-primary border border-brand-primary/20">
                  <HelpCircle size={18} />
                </div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">2. Narrative Description</h3>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs font-bold text-brand-primary hover:text-blue-200 flex items-center gap-1 bg-input-bg border border-neutral-700 hover:border-neutral-600 px-3 py-1.5 rounded-lg shadow-sm transition-all duration-200 active:scale-[0.98]"
              >
                Modify Story
              </button>
            </div>
            <div className="p-6">
              <div className="bg-surface border border-neutral-800 p-5 rounded-xl shadow-inner relative overflow-hidden">
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-brand-primary" />
                <p className="text-sm text-text-primary whitespace-pre-line leading-relaxed italic font-serif pl-2">
                  &ldquo;{detailedDescription}&rdquo;
                </p>
              </div>
            </div>
          </div>

          {/* 3. Evidence Section */}
          <div className="bg-input-bg border border-neutral-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-surface/50 border-b border-neutral-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-brand-primary/10 rounded-lg text-brand-primary border border-brand-primary/20">
                  <Paperclip size={18} />
                </div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">3. Attached Evidence</h3>
              </div>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-xs font-bold text-brand-primary hover:text-blue-200 flex items-center gap-1 bg-input-bg border border-neutral-700 hover:border-neutral-600 px-3 py-1.5 rounded-lg shadow-sm transition-all duration-200 active:scale-[0.98]"
              >
                Modify Evidence
              </button>
            </div>
            <div className="p-6">
              {evidenceFiles.length === 0 ? (
                <div className="text-center py-8 bg-surface border border-dashed border-neutral-800 rounded-xl">
                  <p className="text-sm text-text-secondary italic font-semibold">No evidence files attached to this complaint.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {evidenceFiles.map((file) => (
                    <div key={file.publicId} className="flex items-center gap-3 p-3 border border-neutral-800 rounded-xl text-xs bg-surface shadow-sm transition-all hover:bg-neutral-800/50">
                      <div className="h-10 w-10 bg-input-bg border border-neutral-700 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
                        {file.resourceType === 'image' ? (
                          <img src={file.secureUrl} className="h-10 w-10 object-cover" alt="" />
                        ) : (
                          getFileIcon(file.mimeType, file.extension)
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-text-primary truncate">{file.originalFilename}</p>
                        <p className="text-[10px] text-text-secondary mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB · {file.extension.toUpperCase()}</p>
                        {file.source === 'complaint-intake' && (
                          <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider bg-brand-primary/20 text-brand-primary px-2 py-0.5 rounded-full">
                            Complaint Intake Evidence
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Legal declaration check */}
          <div className="p-5 bg-orange-500/10 border border-orange-500/20 rounded-2xl shadow-sm flex items-start gap-4 transition-all duration-300 hover:bg-orange-500/20">
            <input
              type="checkbox"
              id="declareCheck-input"
              checked={declareCheck}
              onChange={(e) => setDeclareCheck(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-neutral-700 bg-input-bg text-brand-primary focus:ring-brand-primary cursor-pointer flex-shrink-0"
            />
            <label htmlFor="declareCheck-input" className="text-xs text-text-primary leading-relaxed cursor-pointer font-semibold select-none">
              I hereby solemnly declare that all statements made in this e-application are true, complete and correct
              to the best of my knowledge and belief. I understand that filing a false police report is a punishable
              offence under Section 182 of the Indian Penal Code (IPC) and other relevant acts.
            </label>
          </div>

          {/* Stepper Footer Controls */}
          <div className="flex justify-between items-center pt-5 border-t border-neutral-800">
            <Button type="button" variant="ghost" onClick={handlePrev} leftIcon={<ArrowLeft size={16} />}>
              Back to Evidence
            </Button>
            <Button type="submit" isLoading={submitting} leftIcon={<ClipboardCheck size={18} />} className="shadow hover:shadow-md">
              {submitting ? 'Submitting Case...' : 'Submit Complaint'}
            </Button>
          </div>
        </form>
      )}

      {/* Multilingual Voice Recording STT Modal with Live Auto-detect language & Typing text animation */}
      <Modal
        isOpen={isRecordingUIActive}
        onClose={() => {
          stopSTT();
          setIsRecordingUIActive(false);
        }}
        title="Speech-to-Text Case Narrator"
      >
        <div className="py-4 space-y-6 text-neutral-900">
          <div className="flex flex-col items-center justify-center space-y-4">
            {/* Pulsing microphone icon */}
            <div
              onClick={toggleSTT}
              className={[
                'h-20 w-20 rounded-full flex items-center justify-center border-4 cursor-pointer transition-all duration-300 shadow-md select-none',
                isRecording 
                  ? 'bg-red-500 border-red-200 text-white animate-pulse scale-105 shadow-red-200' 
                  : 'bg-primary-50 border-primary-100 text-primary-800 hover:bg-primary-100 hover:scale-102'
              ].join(' ')}
            >
              <Mic size={36} />
            </div>
            
            <div className="text-center">
              <span className="text-xs font-extrabold uppercase tracking-widest text-neutral-400 block mb-1">Status</span>
              <p className="text-sm font-bold text-neutral-800">
                {isRecording ? 'Listening... Speak now' : 'Ready to Record'}
              </p>
            </div>
          </div>

          {/* Multilingual Language Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider">Select Spoken Language</label>
            <select
              value={sttLanguage}
              onChange={(e) => {
                const val = e.target.value;
                setSttLanguage(val);
                if (isRecording) {
                  stopSTT();
                  setTimeout(() => {
                    setSttLanguage(val);
                  }, 100);
                }
              }}
              disabled={isRecording}
              className="w-full px-3.5 py-2.5 rounded-lg border border-neutral-300 focus:ring-2 focus:ring-primary-500 bg-white text-sm font-medium outline-none transition-all cursor-pointer disabled:bg-neutral-50 disabled:text-neutral-400"
            >
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi (हिन्दी - भारत)</option>
              <option value="gu-IN">Gujarati (ગુજરાતી - ભારત)</option>
              <option value="mr-IN">Marathi (मराठी - ભારત)</option>
              <option value="ta-IN">Tamil (தமிழ் - ભારત)</option>
              <option value="bn-IN">Bengali (বাংলা - ભારત)</option>
            </select>
            <p className="text-[10px] text-neutral-400 font-medium">
              You can start speaking; speech-to-text will automatically detect and match scripts in real-time.
            </p>
          </div>

          {/* Live Preview Text area */}
          <div className="space-y-2 relative">
            <div className="flex justify-between items-center mb-1">
              <span className="block text-xs font-bold text-neutral-500 uppercase tracking-wider">Transcribed Output (Real-time)</span>
              {detailedDescription && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold text-neutral-400 uppercase">Language detected:</span>
                  <span className="text-[9px] font-extrabold bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full select-none uppercase tracking-wide">
                    {detectLanguage(detailedDescription) || 'Latin / English'}
                  </span>
                </div>
              )}
            </div>

            <div className="min-h-[140px] max-h-[220px] overflow-y-auto p-4 bg-neutral-50 border border-neutral-200 rounded-xl text-sm leading-relaxed text-neutral-800 shadow-inner relative">
              {detailedDescription ? (
                <p className="whitespace-pre-line">
                  {detailedDescription}
                  {interimTranscript && (
                    <span className="text-neutral-400 font-medium italic"> {interimTranscript}</span>
                  )}
                </p>
              ) : (
                <p className="text-neutral-400 italic font-medium">
                  {interimTranscript ? (
                    <span className="text-neutral-500 italic"> {interimTranscript}</span>
                  ) : (
                    'Click the microphone to start talking. Your speech will appear here...'
                  )}
                </p>
              )}

              {/* Typing Dot Loader */}
              {isRecording && (
                <div className="absolute bottom-2.5 right-3 flex items-center gap-1 bg-white/95 border border-neutral-200 px-2.5 py-1 rounded-md text-[9px] font-bold text-neutral-500 shadow-sm animate-pulse select-none">
                  <span className="h-1 w-1 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1 w-1 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1 w-1 bg-neutral-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span>STT typing...</span>
                </div>
              )}
            </div>
          </div>

          {sttError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700">
              {sttError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-neutral-100">
            {isRecording && (
              <Button type="button" variant="secondary" onClick={stopSTT}>
                Pause
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                stopSTT();
                setIsRecordingUIActive(false);
              }}
            >
              Done &amp; Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* File Preview Modal */}
      {previewFile && (
        <Modal
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
          title={`Preview: ${previewFile.originalFilename}`}
          size="lg"
        >
          <div className="flex flex-col items-center justify-center py-4 max-h-[60vh] overflow-y-auto">
            {previewFile.resourceType === 'image' ? (
              <img
                src={previewFile.secureUrl}
                alt={previewFile.originalFilename}
                className="max-w-full max-h-[50vh] object-contain rounded-lg shadow"
              />
            ) : (
              <div className="text-center space-y-3">
                <FileText size={64} className="mx-auto text-primary-600" />
                <h5 className="font-semibold text-neutral-800">{previewFile.originalFilename}</h5>
                <p className="text-xs text-neutral-500 font-mono">
                  Cloudinary URL: <a href={previewFile.secureUrl} target="_blank" rel="noopener noreferrer" className="text-primary-700 underline">{previewFile.secureUrl}</a>
                </p>
                <div className="grid grid-cols-2 gap-4 text-left max-w-sm mx-auto border-t border-neutral-100 pt-3 text-xs">
                  <div>
                    <span className="font-semibold text-neutral-400">File Size:</span>
                    <p className="text-neutral-800">{(previewFile.size / (1024*1024)).toFixed(2)} MB</p>
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-400">MIME Type:</span>
                    <p className="text-neutral-800">{previewFile.mimeType}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-center pt-6 w-full">
              <Button onClick={() => setPreviewFile(null)}>Close Preview</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Physical Evidence Modal */}
      <Modal
        isOpen={isPhysicalModalOpen}
        onClose={() => setIsPhysicalModalOpen(false)}
        title="Add Physical / Hardware Evidence"
        size="lg"
      >
        <form onSubmit={handlePhysicalSubmit} className="space-y-4 p-4">
          <Input
            label="What is this? (Name of evidence)"
            value={physicalData.name}
            onChange={(e) => setPhysicalData(prev => ({ ...prev, name: e.target.value }))}
            required
            placeholder="e.g. Broken Hard Drive, Knife"
          />
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-1">Description</label>
            <textarea
              value={physicalData.description}
              onChange={(e) => setPhysicalData(prev => ({ ...prev, description: e.target.value }))}
              required
              className="w-full p-2 border border-neutral-300 rounded focus:ring focus:ring-primary-300 outline-none"
              placeholder="Detailed description of the item"
            />
          </div>
          <Input
            label="Where did you find this?"
            value={physicalData.locationFound}
            onChange={(e) => setPhysicalData(prev => ({ ...prev, locationFound: e.target.value }))}
            required
          />
          <Input
            label="Where is the evidence currently located?"
            value={physicalData.currentLocation}
            onChange={(e) => setPhysicalData(prev => ({ ...prev, currentLocation: e.target.value }))}
            required
          />
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-1">Upload Photo of Evidence *</label>
            <input
              type="file"
              accept="image/*"
              required
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setPhysicalFile(e.target.files[0]);
                }
              }}
              className="block w-full text-sm text-neutral-500
                file:mr-4 file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-primary-50 file:text-primary-700
                hover:file:bg-primary-100"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setIsPhysicalModalOpen(false)}>Cancel</Button>
            <Button type="submit">Upload Physical Evidence</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}