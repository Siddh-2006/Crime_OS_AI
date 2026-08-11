'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, File, Image, Film, Music, FileText, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import apiClient from '@/lib/axios';
import { API_ROUTES } from '@/lib/constants';

export interface UploadedFile {
  publicId: string;
  secureUrl: string;
  resourceType: string;
  mimeType: string;
  originalFilename: string;
  extension: string;
  size: number;
}

interface FileUploadProps {
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  uploadSignatureUrl?: string;
}

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
  fileObject: File;
}

export function FileUpload({
  value = [],
  onChange,
  maxFiles = 10,
  maxSizeMB = 100,
  uploadSignatureUrl,
}: FileUploadProps): React.ReactElement {
  const [uploads, setUploads] = useState<Record<string, UploadProgress>>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/mpeg', 'video/quicktime',
    'audio/mpeg', 'audio/wav', 'audio/mp3',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/msword', // doc
    'application/zip', 'application/x-zip-compressed'
  ];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = (files: File[]) => {
    const totalCount = value.length + Object.keys(uploads).filter(k => uploads[k].status === 'uploading').length;
    if (totalCount + files.length > maxFiles) {
      alert(`You can only upload a maximum of ${maxFiles} files.`);
      return;
    }

    files.forEach((file) => {
      // Validate type
      if (!allowedTypes.includes(file.type) && !file.name.endsWith('.docx') && !file.name.endsWith('.zip')) {
        alert(`File type not supported: ${file.name}. Only Images, Videos, Audio, PDF, DOCX, ZIP allowed.`);
        return;
      }
      // Validate size
      if (file.size > maxSizeMB * 1024 * 1024) {
        alert(`File too large: ${file.name}. Maximum size is ${maxSizeMB}MB.`);
        return;
      }

      uploadFile(file);
    });
  };

  const uploadFile = async (file: File) => {
    const fileId = `${file.name}-${file.size}-${Date.now()}`;
    
    // Add to progress state
    setUploads((prev) => ({
      ...prev,
      [fileId]: {
        fileName: file.name,
        progress: 0,
        status: 'uploading',
        fileObject: file,
      },
    }));

    try {
      // 1. Fetch upload signature from backend
      const sigRes = await apiClient.post(uploadSignatureUrl || API_ROUTES.COMPLAINTS.UPLOAD_SIGNATURE);
      const { signature, timestamp, apiKey, cloudName, folder, publicId } = sigRes.data.data;

      // 2. Prepare FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp.toString());
      formData.append('signature', signature);
      formData.append('folder', folder);
      formData.append('public_id', publicId);

      // 3. Upload directly to Cloudinary
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/upload`, true);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setUploads((prev) => ({
            ...prev,
            [fileId]: { ...prev[fileId], progress: percent },
          }));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          const extension = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase();
          
          const uploadedItem: UploadedFile = {
            publicId: response.public_id,
            secureUrl: response.secure_url,
            resourceType: response.resource_type,
            mimeType: file.type || 'application/octet-stream',
            originalFilename: file.name,
            extension,
            size: response.bytes,
          };

          // Update parent state
          onChange([...value, uploadedItem]);

          // Update progress state
          setUploads((prev) => {
            const copy = { ...prev };
            delete copy[fileId]; // Clean up progress once successfully uploaded
            return copy;
          });
        } else {
          setUploads((prev) => ({
            ...prev,
            [fileId]: {
              ...prev[fileId],
              status: 'error',
              error: 'Failed to upload to storage. Check connection.',
            },
          }));
        }
      };

      xhr.onerror = () => {
        setUploads((prev) => ({
          ...prev,
          [fileId]: {
            ...prev[fileId],
            status: 'error',
            error: 'Network error occurred.',
          },
        }));
      };

      xhr.send(formData);

    } catch (err: any) {
      setUploads((prev) => ({
        ...prev,
        [fileId]: {
          ...prev[fileId],
          status: 'error',
          error: err.response?.data?.message || 'Authentication or signing error.',
        },
      }));
    }
  };

  const handleRetry = (fileId: string) => {
    const uploadItem = uploads[fileId];
    if (uploadItem) {
      uploadFile(uploadItem.fileObject);
    }
  };

  const handleCancelProgress = (fileId: string) => {
    setUploads((prev) => {
      const copy = { ...prev };
      delete copy[fileId];
      return copy;
    });
  };

  const handleRemoveFile = (index: number) => {
    const updated = [...value];
    updated.splice(index, 1);
    onChange(updated);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="h-6 w-6 text-blue-500" />;
    if (mimeType.startsWith('video/')) return <Film className="h-6 w-6 text-purple-500" />;
    if (mimeType.startsWith('audio/')) return <Music className="h-6 w-6 text-teal-500" />;
    if (mimeType === 'application/pdf') return <FileText className="h-6 w-6 text-red-500" />;
    return <File className="h-6 w-6 text-neutral-500" />;
  };

  return (
    <div className="space-y-4">
      {/* Drag & Drop Zone */}
      {value.length < maxFiles && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={[
            'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200',
            isDragging
              ? 'border-primary-500 bg-primary-50/50 scale-[0.99]'
              : 'border-neutral-700 hover:border-primary-400 bg-neutral-50/50 hover:bg-neutral-800/30',
          ].join(' ')}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip"
            onChange={handleFileSelect}
          />
          <Upload className="mx-auto h-10 w-10 text-neutral-400 mb-3" />
          <p className="text-sm font-semibold text-text-secondary">
            Drag and drop your supporting evidence here, or <span className="text-primary-600 hover:underline">browse</span>
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            Supports Images, Videos, Audio, PDF, DOCX, ZIP (Max {maxSizeMB}MB each)
          </p>
        </div>
      )}

      {/* Upload Progress Queue */}
      {Object.keys(uploads).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-neutral-500">Uploading...</p>
          {Object.entries(uploads).map(([id, item]) => (
            <div key={id} className="flex items-center gap-3 p-3 bg-neutral-900/50 border border-neutral-700 rounded-lg shadow-sm">
              <RefreshCw className="h-5 w-5 text-primary-500 animate-spin flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-secondary truncate">{item.fileName}</p>
                <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="bg-primary-600 h-full rounded-full transition-all duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-neutral-500">{item.progress}%</span>
                {item.status === 'error' ? (
                  <button
                    onClick={() => handleRetry(id)}
                    className="p-1 hover:bg-neutral-800 rounded text-red-500"
                    title="Retry"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  onClick={() => handleCancelProgress(id)}
                  className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-text-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed Uploads List */}
      {value.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-neutral-500">Uploaded Evidence ({value.length})</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {value.map((file, index) => (
              <div key={file.publicId} className="flex items-center gap-3 p-3 bg-neutral-900/50 border border-neutral-700 rounded-lg shadow-sm relative group">
                <div className="flex-shrink-0">
                  {getFileIcon(file.mimeType)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate" title={file.originalFilename}>
                    {file.originalFilename}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {(file.size / 1024 / 1024).toFixed(2)} MB • {file.extension.toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-red-500 transition-colors"
                    title="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
