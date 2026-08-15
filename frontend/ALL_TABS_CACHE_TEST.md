# Testing All Tabs Cache

## What Changed

The offline system now caches **ALL tabs** of a case when you open it, not just the tab you're viewing.

### Previous Behavior (Problem)
- Open case → Only "AI Analysis" tab cached
- Switch to "Participants" → That tab fetched from server
- Go offline → "Participants" tab unavailable

### New Behavior (Fixed)
- Open case → **ALL tabs cached immediately** (Analysis, Participants, Diary, Evidence, etc.)
- Switch to any tab online or offline → All data available
- Go offline → All tabs work from cache

## How It Works

1. **When you open a case** (visit the case detail page):
   - The `OfflineWorkspaceWrapper` immediately fetches data for ALL 12 endpoints:
     - `/cases/{id}/analysis/latest`
     - `/cases/{id}/checklist`
     - `/cases/{id}/diary`
     - `/cases/{id}/diary/history`
     - `/cases/{id}/diary/places`
     - `/cases/{id}/requests`
     - `/cases/{id}/evidence`
     - `/cases/{id}/participants`
     - `/cases/{id}/warrants`
     - `/cases/{id}/threads`
     - `/complaints/{id}`
     - `/case-understanding/{id}`

2. **All data is saved** to IndexedDB in a single `CachedCase` entry

3. **When offline**, switching tabs uses the cached data automatically

## Testing Steps

### Test 1: Verify All Tabs Cached Online

```
1. Open browser with DevTools (F12) → Console tab
2. Login as IO/SHO
3. Open any case
4. Watch console logs → Should see:
   "[OfflineWorkspaceWrapper] Fetching ALL tabs for case {id}..."
   "[OfflineWorkspaceWrapper] Case {id} cached successfully (7/7 main tabs)"
5. Verify: Open DevTools → Application → IndexedDB → CrimeOS_Offline → cases
6. Click on the case entry → Expand to see all fields:
   - snapshot ✓
   - checklist ✓
   - diaryEntries ✓
   - participants ✓
   - evidence ✓
   - warrants ✓
   - requests ✓
   - etc.
```

### Test 2: Verify All Tabs Work Offline

```
1. Open case online (wait for caching - check console)
2. Stay on "AI Analysis" tab
3. Go offline: DevTools → Network → Offline
4. Switch to "Participants" tab
   → Should load instantly from cache ✓
5. Switch to "Evidence" tab
   → Should load from cache ✓
6. Switch to "Diary" tab
   → Should load from cache ✓
7. Switch to "Requests" tab
   → Should load from cache ✓
8. Try all other tabs
   → All should work offline ✓
```

### Test 3: Verify Cache Persistence

```
1. Open case online (caching happens)
2. Go offline
3. Switch between multiple tabs → All work
4. Refresh the browser (F5)
5. Case should still load from cache
6. Switch between tabs → Still works
7. Close browser
8. Reopen browser
9. Navigate to the case
10. All tabs should still work offline
```

### Test 4: Verify Console Logs

**When opening a case online:**
```
[OfflineWorkspaceWrapper] Fetching ALL tabs for case 6a7f7e09...
[OfflineWorkspaceWrapper] Case 6a7f7e09 cached successfully (7/7 main tabs)
```

**When switching tabs offline:**
```
[OfflineApiClient] Retrieved from cache: /cases/6a7f7e09/participants
[OfflineApiClient] Retrieved from cache: /cases/6a7f7e09/evidence
[OfflineApiClient] Retrieved from cache: /cases/6a7f7e09/diary
```

### Test 5: Verify Empty Tabs Handled

Some cases might not have all data (e.g., no warrants, no evidence):

```
1. Open a case with missing data (e.g., no evidence)
2. Go offline
3. Switch to "Evidence" tab
4. Should show empty list, not error ✓
5. Console should show:
   "[OfflineApiClient] Retrieved from cache: /cases/{id}/evidence"
   (data is empty array [])
```

## Expected Results

✅ **All tabs cached when case is opened**
- Only need to open the case once
- Don't need to click every tab to cache them

✅ **All tabs work offline**
- Can switch between any tab offline
- No "loading..." or errors
- Instant tab switching from cache

✅ **Cache persists**
- Survives page refresh
- Survives browser restart
- Up to 5 cases cached per officer

✅ **Empty data handled**
- Empty arrays cached properly
- Null data cached properly
- No errors when data is missing

## Troubleshooting

### Some Tabs Still Don't Work Offline

**Symptom**: "Participants" tab shows loading spinner forever when offline

**Solution**:
1. Check console for errors
2. Look for: `[OfflineApiClient] No exact cache mapping for URL: ...`
3. If you see this, the endpoint might not be mapped
4. Report the exact URL pattern

### Cache Not Happening

**Symptom**: Console doesn't show "cached successfully" message

**Solution**:
1. Ensure you're online when opening the case
2. Wait at least 500ms after opening the case
3. Check browser console for errors
4. Verify `OfflineWorkspaceWrapper` is being used (not plain `InvestigationWorkspace`)

### Data is Stale

**Symptom**: Offline data is old, doesn't reflect recent changes

**Solution**:
1. Cache updates every time you open the case **while online**
2. To refresh cache:
   - Go online
   - Navigate away from the case
   - Navigate back to the case
   - Cache refreshes automatically
3. Or clear cache and rebuild:
   ```js
   // Browser console
   await indexedDB.deleteDatabase('CrimeOS_Offline');
   location.reload();
   ```

## Implementation Details

### Timing
- **Cache trigger**: When case page loads (500ms delay)
- **Fetch method**: Parallel requests for all 12 endpoints
- **Cache time**: ~2-3 seconds for all data
- **Cache size**: ~100-500KB per case (varies)

### Endpoints Cached

| Endpoint | Tab(s) | Data Type |
|----------|--------|-----------|
| `/cases/{id}/analysis/latest` | AI Analysis | AI snapshot |
| `/cases/{id}/checklist` | Checklist | Investigation steps |
| `/cases/{id}/diary` | Diary | Diary entries |
| `/cases/{id}/diary/history` | Diary | Historical entries |
| `/cases/{id}/diary/places` | Places Visited | Location logs |
| `/cases/{id}/requests` | Requests | Department requests |
| `/cases/{id}/evidence` | Evidence | Evidence files |
| `/cases/{id}/participants` | Participants | Case actors |
| `/cases/{id}/warrants` | Custody | Arrest warrants |
| `/cases/{id}/threads` | Requests | Communication threads |
| `/complaints/{id}` | Original Complaint | Complaint details |
| `/case-understanding/{id}` | Case Understanding | AI insights |

### Cache Structure

```typescript
interface CachedCase {
  case_id: string;
  officer_id: string;
  last_accessed: number;
  last_synced: number;
  version: number;
  
  // All tab data
  snapshot: any | null;
  checklist: any | null;
  diaryEntries: any[];
  diaryHistory: any[];
  placesVisited: any[];
  requests: any[];
  evidence: any[];
  participants: any[];
  warrants: any[];
  threads: any[];
  complaintData: any | null;
  caseUnderstanding: any | null;
}
```

## Summary

✅ **Problem Fixed**: All tabs now cached when case is opened  
✅ **User Experience**: No need to click every tab to cache them  
✅ **Offline Access**: All tabs work seamlessly offline  
✅ **Performance**: Parallel fetching is fast (~2-3s)  
✅ **Storage**: Efficient caching (only 5 most recent cases)  

The system now provides a **complete offline experience** for case investigation, with all case data available regardless of which tabs were previously visited.
