/**
 * Sync Status Indicator
 * 
 * Displays current sync status in the navbar.
 * Shows online/offline state and pending sync operations.
 */

'use client';

import React from 'react';
import { useSync } from '@/hooks/useSync';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export function SyncStatusIndicator() {
  const { status, isOnline, pendingCount, lastSyncTime, lastError, triggerSync } = useSync();

  const getStatusIcon = () => {
    switch (status) {
      case 'syncing':
        return <Loader2 size={16} className="animate-spin text-brand-primary" />;
      case 'synced':
        return isOnline ? (
          <CheckCircle2 size={16} className="text-semantic-success" />
        ) : (
          <CloudOff size={16} className="text-text-secondary" />
        );
      case 'pending':
        return <RefreshCw size={16} className="text-semantic-warning" />;
      case 'failed':
        return <AlertCircle size={16} className="text-semantic-critical" />;
      case 'offline':
        return <CloudOff size={16} className="text-text-secondary" />;
      default:
        return <Cloud size={16} className="text-text-secondary" />;
    }
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    
    switch (status) {
      case 'syncing':
        return 'Syncing...';
      case 'synced':
        return 'Synced';
      case 'pending':
        return `${pendingCount} pending`;
      case 'failed':
        return 'Sync failed';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return 'text-text-secondary';
    
    switch (status) {
      case 'syncing':
        return 'text-brand-primary';
      case 'synced':
        return 'text-semantic-success';
      case 'pending':
        return 'text-semantic-warning';
      case 'failed':
        return 'text-semantic-critical';
      default:
        return 'text-text-secondary';
    }
  };

  const handleClick = () => {
    if (isOnline && (status === 'pending' || status === 'failed')) {
      triggerSync();
    }
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return null;
    
    const diff = Date.now() - lastSyncTime;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    
    return 'Over a day ago';
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all ${
        isOnline && (status === 'pending' || status === 'failed')
          ? 'cursor-pointer hover:bg-surface-elevated'
          : ''
      }`}
      onClick={handleClick}
      title={
        lastError
          ? `Error: ${lastError}`
          : lastSyncTime
          ? `Last synced: ${formatLastSync()}`
          : 'Sync status'
      }
    >
      {getStatusIcon()}
      <span className={`font-medium ${getStatusColor()}`}>
        {getStatusText()}
      </span>
      
      {/* Show subtle last sync time */}
      {isOnline && status === 'synced' && lastSyncTime && (
        <span className="text-xs text-text-tertiary">
          {formatLastSync()}
        </span>
      )}
    </div>
  );
}
