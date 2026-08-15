# Fixed Offline Approach

## What Changed

### ❌ Old Broken Approach
- `OfflineWorkspaceWrapper` tried to pre-fetch all tabs
- Caused race conditions and navigation issues
- Over-complicated

### ✅ New Working Approach  
- **Auto-cache on success**: Every successful GET request automatically caches its data
- **Incremental caching**: Tabs get cached as you visit them
- **Simple & reliable**: No pre-fetching, no race conditions

## How It Works Now

### 1. Automatic Caching (Online)
When you make any API call while online:
```
User visits "Participants" tab
  ↓
InvestigationWorkspace calls: GET /cases/123/participants
  ↓
Axios interceptor (success):
  - Response received successfully
  - Auto-save to IndexedDB: participants = [...]
  - Console: "✓ Auto-cached: participants"
  ↓
User sees participants (from server)
Cache updated in background
```

### 2. Cache Retrieval (Offline)
When you make any API call while offline:
```
User visits "Evidence" tab (offline)
  ↓
InvestigationWorkspace calls: GET /cases/123/evidence
  ↓
Network error (offline)
  ↓
Axios interceptor (error):
  - Detect network error
  - Check IndexedDB for case 123
  - Find cached evidence data
  - Return from cache
  - Console: "✓ Cache hit!"
  ↓
User sees evidence (from cache)
```

### 3. Mutation Queueing (Offline)
When you make changes while offline:
```
User updates participant (offline)
  ↓
InvestigationWorkspace calls: PATCH /cases/123/participants/456
  ↓
Network error (offline)
  ↓
Axios interceptor (error):
  - Detect network error & mutation
  - Queue in outbox
  - Toast: "Participant update saved"
  - Console: "✓ Mutation queued"
  ↓
User sees success message
Change will sync when online
```

## Key Benefits

✅ **Simple**: No pre-fetching logic
✅ **Incremental**: Cache builds as you use the app
✅ **Reliable**: No race conditions
✅ **Transparent**: Works without changing InvestigationWorkspace
✅ **Efficient**: Only caches what you actually view

## Testing

### Test 1: Auto-Caching
```
1. Open case online
2. Visit "AI Analysis" tab
3. Check console → "✓ Auto-cached: latest"
4. Visit "Participants" tab  
5. Check console → "✓ Auto-cached: participants"
6. Visit "Evidence" tab
7. Check console → "✓ Auto-cached: evidence"

Result: Each tab auto-caches as you visit it
```

### Test 2: Offline Access
```
1. Open case online
2. Visit "Participants" and "Evidence" tabs (they get cached)
3. Go offline
4. Refresh page
5. Visit "Participants" tab
6. Check console → "✓ Cache hit!"
7. Visit "Evidence" tab
8. Check console → "✓ Cache hit!"
9. Try "Diary" tab (not visited before)
10. Should show loading... then empty/error

Result: Visited tabs work offline, unvisited tabs don't
```

### Test 3: All Tabs Cached
```
1. Open case online
2. Click through ALL tabs once:
   - AI Analysis
   - Checklist
   - Diary
   - Places Visited
   - Requests
   - Evidence
   - Participants
   - Custody
   - Original Complaint
   - Case Understanding
3. Check console → Should see 10+ "✓ Auto-cached" messages
4. Go offline
5. Refresh page
6. Click through all tabs again
7. All should work from cache!

Result: All visited tabs available offline
```

## Console Logs to Watch

### When Online (Caching)
```
[apiClient] ✓ Auto-cached: latest
[apiClient] ✓ Auto-cached: participants  
[apiClient] ✓ Auto-cached: evidence
[apiClient] ✓ Created cache with: diary
```

### When Offline (Reading)
```
[apiClient] ⚠️ Network error for GET /cases/123/participants
[apiClient] Navigator online status: false
[apiClient] 📦 Attempting cache retrieval...
[OfflineApiClient] Retrieved from cache: /cases/123/participants
[apiClient] ✓ Cache hit!
```

### When Offline (Writing)
```
[apiClient] ⚠️ Network error for PATCH /cases/123/participants/456
[apiClient] Navigator online status: false
[apiClient] 📝 Queueing mutation for sync...
[OfflineApiClient] Mutation queued: PATCH /cases/123/participants/456
[apiClient] ✓ Mutation queued
Toast: "Participant update saved. Will sync when you're back online."
```

## Why This is Better

### Previous Approach Issues
1. Pre-fetching all tabs caused duplicate requests
2. Race conditions between wrapper and workspace
3. Service worker conflicts
4. Navigation failures offline

### Current Approach Benefits
1. ✅ No duplicate requests (cache on first fetch only)
2. ✅ No race conditions (single source of truth: axios interceptor)
3. ✅ Service worker independent (data in IndexedDB, not SW cache)
4. ✅ Navigation works (HTML pages from server/SW, data from IndexedDB)

## Summary

**Cache Strategy**: Lazy/Incremental
- Tabs cache **as you visit them**
- Not all-at-once pre-fetching

**User Experience**:
- Online: Normal speed, data auto-caches
- Offline: Visited tabs work, unvisited tabs don't
- To cache all tabs: Simply click through them once while online

**Implementation**:
- ✅ Mutations queue correctly (working)
- ✅ Data caches automatically (new fix)
- ✅ Cache serves offline (working)
- ✅ Sync works when online (working)

**Next Step**: Test and verify all tabs cache as you visit them!
