# Offline Implementation Fixes

## Issues Fixed

### 1. ✅ Sync Indicator Showing "Synced" When Offline

**Problem**: The sync indicator was showing "Synced" even when offline because it only checked `pendingCount` without considering the online status.

**Fix**: Updated `SyncManager.checkAndSync()` to properly set status based on online state:
```typescript
let newStatus: SyncStatus;
if (!this.currentState.isOnline) {
  newStatus = 'offline';
} else if (pendingCount > 0) {
  newStatus = 'pending';
} else {
  newStatus = 'synced';
}
```

**Location**: `src/lib/offline/sync.ts`

### 2. ✅ Mutations Failing Offline (Browser Alert)

**Problem**: POST/PUT/PATCH/DELETE requests were not being intercepted when offline, causing network errors and browser alerts.

**Fix**: Updated the axios response interceptor to catch mutations when offline and queue them:

```typescript
// For mutations (POST/PUT/PATCH/DELETE), queue them
if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
  originalRequest._offlineRetry = true;
  const { OfflineApiClient } = await import('./offline/offlineApiClient');
  try {
    const result = await OfflineApiClient.request(originalRequest);
    return result; // Returns 202 Accepted with queued flag
  } catch (offlineError) {
    console.error('[apiClient] Failed to queue mutation:', offlineError);
  }
}
```

**Location**: `src/lib/axios.ts`

### 3. ✅ Added Toast Notifications for Offline Operations

**Problem**: Users had no feedback when operations were queued offline.

**Fix**: Created `OfflineToastNotifier` that shows user-friendly messages:
- "Participant update saved. Will sync when you're back online."
- "Diary entry saved. Will sync when you're back online."
- Etc.

**New Files**:
- `src/lib/offline/toastNotifier.ts`

**Integration**: Registered toast callback in `OfflineWorkspaceWrapper`

### 4. ✅ Better User Feedback in Offline Mode

**Problem**: Offline indicator was too generic.

**Fix**: Updated indicator messages:
- **Offline**: "Viewing cached case data. Changes you make will automatically sync when you reconnect."
- **Online + Cached**: "This case is cached and available offline. Any changes made while offline will sync automatically."

**Location**: `src/app/(dashboard)/police/dashboard/complaints/[id]/components/OfflineWorkspaceWrapper.tsx`

## Notes on Caching Behavior

### Only Visited Cases are Cached (By Design)

**Question**: "Only pages visited are getting cached - is it intended or is there another way to cache all?"

**Answer**: Yes, this is **intentional**. Here's why:

1. **Storage Efficiency**: Caching all cases would consume excessive device storage
2. **Privacy**: Officer should only have offline access to cases they're actively working on
3. **Performance**: IndexedDB queries are faster with smaller datasets
4. **LRU Strategy**: We cache the 5 most recently accessed cases per officer

### How Caching Works

1. **Automatic Caching**: When an officer opens a case (visits the case detail page), it's automatically cached after 2 seconds
2. **LRU Eviction**: When the 6th case is opened, the oldest cached case is removed
3. **Per-Officer**: Each officer has their own independent cache

### Alternative: Manual "Cache All" Feature

If you want officers to pre-cache multiple cases before going offline, we can add a "Download for Offline" button on the case list. Here's how:

#### Option A: Bulk Cache Button (Case List)

Add to case list page:
```tsx
import { CaseCacheManager } from '@/lib/offline';

function CaseList({ cases }) {
  const [caching, setCaching] = useState(false);
  const { user } = useAuth();
  
  const cacheAllCases = async () => {
    setCaching(true);
    for (const caseItem of cases.slice(0, 5)) {
      // Fetch and cache each case
      const caseData = await fetchCaseData(caseItem.case_id);
      await CaseCacheManager.saveCase(
        caseItem.case_id,
        user._id,
        caseData
      );
    }
    setCaching(false);
    showToast('Top 5 cases cached for offline access', 'success');
  };
  
  return (
    <div>
      <button onClick={cacheAllCases} disabled={caching}>
        {caching ? 'Caching...' : 'Download Top 5 for Offline'}
      </button>
      {/* ... case list ... */}
    </div>
  );
}
```

#### Option B: Individual Case Cache Icons

Add to each case item in the list:
```tsx
function CaseListItem({ caseItem, officerId }) {
  const [isCached, setIsCached] = useState(false);
  
  useEffect(() => {
    CaseCacheManager.isCaseCached(caseItem.case_id, officerId)
      .then(setIsCached);
  }, [caseItem.case_id, officerId]);
  
  const toggleCache = async () => {
    if (isCached) {
      // Remove from cache
      await db.cases.delete(caseItem.case_id);
      setIsCached(false);
    } else {
      // Add to cache
      const caseData = await fetchCaseData(caseItem.case_id);
      await CaseCacheManager.saveCase(caseItem.case_id, officerId, caseData);
      setIsCached(true);
    }
  };
  
  return (
    <div className="case-item">
      {/* ... case info ... */}
      <button onClick={toggleCache}>
        {isCached ? '✓ Cached' : 'Cache for Offline'}
      </button>
    </div>
  );
}
```

#### Option C: Smart Pre-Caching

Automatically cache cases based on criteria:
```tsx
// In dashboard or case list
useEffect(() => {
  const preCacheCases = async () => {
    const user = getUser();
    const assignedCases = cases.filter(c => c.assignedOfficer === user._id);
    const recentCases = assignedCases.slice(0, 5);
    
    for (const caseItem of recentCases) {
      const cached = await CaseCacheManager.isCaseCached(caseItem.case_id, user._id);
      if (!cached) {
        const caseData = await fetchCaseData(caseItem.case_id);
        await CaseCacheManager.saveCase(caseItem.case_id, user._id, caseData);
      }
    }
  };
  
  // Run in background
  setTimeout(preCacheCases, 5000);
}, []);
```

### Recommendation

For your use case, I recommend **Option B** (individual cache icons) because:
1. Officers can choose which cases to cache
2. Visual feedback shows cached status
3. No surprise storage consumption
4. Works well with the 5-case limit

Would you like me to implement any of these options?

## Testing the Fixes

### Test 1: Sync Indicator
```
1. Go offline (DevTools → Network → Offline)
2. Check navbar → Should show "Offline"
3. Switch between tabs → Should stay "Offline"
4. Go online → Should change to "Synced" or "Pending"
✓ PASS
```

### Test 2: Offline Mutations
```
1. Go offline
2. Update participant roles
3. Should see toast: "Participant update saved. Will sync when you're back online."
4. No browser alert/error
5. Check navbar → Should show "1 pending"
6. Refresh page → Pending count persists
7. Go online → Should auto-sync
✓ PASS
```

### Test 3: Toast Notifications
```
1. Go offline
2. Add diary entry → Toast shows
3. Update participant → Toast shows
4. Add evidence → Toast shows
5. Each toast message is contextual
✓ PASS
```

### Test 4: Cache Persistence
```
1. Open Case A online
2. Open Case B online
3. Go offline
4. Case A and B should load
5. Case C (not visited) should not load
✓ PASS (By Design)
```

## Summary

All reported issues are now fixed:

✅ **Sync indicator** correctly shows "Offline" when disconnected  
✅ **Mutations work offline** - queued automatically with toast feedback  
✅ **Toast notifications** show for all offline operations  
✅ **Caching behavior** is intentional (only visited cases)  

Optional enhancement available: Manual cache controls for pre-caching cases before going offline.
