# Offline-First Setup Guide

Quick guide to enable offline functionality in Crime OS.

## Installation

Dependencies have been installed:
- `dexie` (v4.x) - IndexedDB wrapper
- `@ducanh2912/next-pwa` (v10.x) - PWA support for Next.js 14
- `uuid` - Unique operation IDs

## Build & Run

### Development
```bash
npm run dev
```

Note: PWA is disabled in development by default. Service worker will not be active.

### Production
```bash
npm run build
npm start
```

PWA features are only active in production builds.

## Testing Offline Mode

### 1. Build and Run Production Server
```bash
npm run build
npm start
```

### 2. Open in Browser
Navigate to `http://localhost:3000`

### 3. Install as PWA
- Chrome: Look for install icon in address bar
- Edge: Click "Install Crime OS" in menu
- Mobile: Add to Home Screen

### 4. Test Offline
1. Login as a police officer (SHO or IO)
2. Open a case - it will be automatically cached
3. Open Chrome DevTools (F12) → Network tab
4. Select "Offline" from throttling dropdown
5. Refresh the page - case should still load from cache
6. Make changes (add diary entry, update participant, etc.)
7. Check navbar - sync indicator shows "X pending"
8. Go back online - changes sync automatically

## Verify Installation

### Check PWA Manifest
Visit: `http://localhost:3000/manifest.json`

Should see:
```json
{
  "name": "Crime OS - Gujarat Police",
  "short_name": "Crime OS",
  ...
}
```

### Check Service Worker
1. Open DevTools → Application tab
2. Click "Service Workers" in sidebar
3. Should see service worker registered

### Check IndexedDB
1. Open DevTools → Application tab
2. Click "IndexedDB" in sidebar
3. Should see "CrimeOS_Offline" database with:
   - `cases` table
   - `outbox` table
   - `metadata` table

## Integration Steps

To integrate offline support into existing components:

### Step 1: Wrap Case Workspace
```tsx
// In: src/app/(dashboard)/police/dashboard/complaints/[id]/page.tsx

// Before:
import { InvestigationWorkspace } from './components/InvestigationWorkspace';

// After:
import { OfflineWorkspaceWrapper } from './components/OfflineWorkspaceWrapper';

// In render:
// Before:
<InvestigationWorkspace caseId={caseId} activeTab={activeTab} />

// After:
<OfflineWorkspaceWrapper caseId={caseId} activeTab={activeTab} />
```

### Step 2: Update Mutation Handlers (Optional)
If you want to add offline support to custom mutation handlers:

```tsx
import { offlinePost } from '@/lib/offline/offlineHelpers';

// Before:
await apiClient.post(`/cases/${caseId}/participants`, data);

// After:
const result = await offlinePost(`/cases/${caseId}/participants`, data, {
  affectedFields: ['participants'],
});

if (result.queued) {
  showToast('Queued for sync', 'info');
}
```

## Components Added

### UI Components
- `SyncStatusIndicator` - Shows sync status in navbar
- `OfflineBanner` - Persistent banner when offline
- `OfflineEvidenceManager` - Download evidence for offline
- `OfflineWorkspaceWrapper` - Wraps workspace with offline support

### Hooks
- `useSync` - Monitor sync state
- `useCaseData` - Fetch case data with offline fallback

### Core Infrastructure
- `db.ts` - IndexedDB schema
- `caseCache.ts` - Case caching logic
- `outbox.ts` - Mutation queue
- `sync.ts` - Sync orchestration
- `offlineApiClient.ts` - Offline-aware API client
- `offlineHelpers.ts` - Helper functions

## Configuration

### PWA Configuration
Edit `next.config.mjs` to customize PWA behavior:

```js
const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true, // Cache on navigation
  aggressiveFrontEndNavCaching: true, // Aggressive caching
  reloadOnOnline: true, // Reload when coming back online
  swcMinify: true,
  disable: process.env.NODE_ENV === 'development', // Disable in dev
  workboxOptions: {
    disableDevLogs: true,
  },
});
```

### Cache Limits
Edit `src/lib/offline/caseCache.ts`:

```ts
const MAX_CASES_PER_OFFICER = 5; // Change this to adjust cache size
```

### Retry Configuration
Edit `src/lib/offline/outbox.ts`:

```ts
status: operation.retry_count >= 3 ? 'failed' : 'pending',
// Change 3 to adjust max retries
```

## Troubleshooting

### Service Worker Not Registering
1. Check you're running production build (`npm run build && npm start`)
2. Service workers require HTTPS (or localhost)
3. Clear browser cache and hard reload (Ctrl+Shift+R)

### Cache Not Working
1. Open DevTools → Console
2. Look for `[useCaseData]` logs
3. Check if case is being cached: "Fetched and cached case X"
4. Verify IndexedDB has entries

### Sync Not Happening
1. Check network status: `SyncManager.isOnline()`
2. Check pending operations: `OutboxManager.getPendingOperations(officerId)`
3. Look for sync logs: `[SyncManager]` and `[Outbox]`
4. Manually trigger: Click sync indicator in navbar

### Clear All Offline Data
```js
// Open browser console and run:
indexedDB.deleteDatabase('CrimeOS_Offline');
// Then reload page
```

## Production Deployment

### Environment Variables
No additional environment variables required. Uses existing:
- `NEXT_PUBLIC_API_URL` - API base URL

### Build Optimization
```bash
# Standard Next.js build
npm run build

# Output includes:
# - Optimized static pages
# - Service worker (public/sw.js)
# - Workbox runtime (public/workbox-*.js)
```

### Hosting Requirements
- HTTPS required for PWA features
- No server-side changes needed
- IndexedDB supported by all modern browsers

### Browser Support
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 11.3+)
- Mobile browsers: Full support

## Monitoring

### Check Sync Status
```tsx
import { useSync } from '@/hooks/useSync';

function SyncMonitor() {
  const { status, pendingCount, lastSyncTime } = useSync();
  
  return (
    <div>
      Status: {status}
      Pending: {pendingCount}
      Last sync: {new Date(lastSyncTime).toLocaleString()}
    </div>
  );
}
```

### Check Cache Size
```js
// Browser console:
const db = await window.indexedDB.open('CrimeOS_Offline');
const cases = await db.transaction('cases').objectStore('cases').count();
console.log('Cached cases:', cases);
```

### Export Pending Operations
```tsx
import { OutboxManager } from '@/lib/offline';

const pending = await OutboxManager.getPendingOperations(officerId);
console.table(pending);
```

## Next Steps

1. **Test thoroughly** in production build
2. **Monitor sync failures** and adjust retry logic
3. **Train users** on offline features
4. **Set up analytics** to track offline usage
5. **Consider selective caching** for specific cases

## Support

For issues or questions:
1. Check `OFFLINE_IMPLEMENTATION.md` for detailed architecture
2. Review browser console logs (`[SyncManager]`, `[Outbox]`, `[CaseCache]`)
3. Test in incognito mode to rule out extension conflicts
4. Verify IndexedDB quota (Settings → Privacy → Site data)
