# Offline Integration Checklist

Quick checklist for integrating offline support into Crime OS.

## ✅ Pre-Integration (Already Done)

- [x] Dependencies installed (`dexie`, `@ducanh2912/next-pwa`, `uuid`)
- [x] PWA configuration added to `next.config.mjs`
- [x] Manifest file created (`public/manifest.json`)
- [x] Offline infrastructure implemented (`src/lib/offline/`)
- [x] Hooks created (`useSync`, `useCaseData`, `useOfflineMutation`)
- [x] UI components created (SyncStatusIndicator, OfflineBanner, etc.)
- [x] Root layout updated with PWA metadata
- [x] Dashboard layout updated with sync indicators
- [x] Auth context updated with cache cleanup

## 🔧 Integration Steps

### Step 1: Verify Build
```bash
cd frontend
npm run build
```

**Expected Output:**
- ✓ Compiled successfully
- Service worker created at `public/sw.js`
- No TypeScript errors

### Step 2: Test in Production Mode
```bash
npm start
```

Navigate to `http://localhost:3000`

**Verification:**
- [ ] PWA install icon appears in browser address bar
- [ ] DevTools → Application → Service Workers shows registered worker
- [ ] DevTools → Application → IndexedDB shows `CrimeOS_Offline` database

### Step 3: Integrate Workspace Wrapper

Find the case detail page (likely at):
`src/app/(dashboard)/police/dashboard/complaints/[id]/page.tsx`

**Current Code** (example):
```tsx
import { InvestigationWorkspace } from './components/InvestigationWorkspace';

export default function CaseDetailPage({ params }) {
  const [activeTab, setActiveTab] = useState('analysis');
  
  return (
    <InvestigationWorkspace
      caseId={params.id}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    />
  );
}
```

**Updated Code**:
```tsx
import { OfflineWorkspaceWrapper } from './components/OfflineWorkspaceWrapper';

export default function CaseDetailPage({ params }) {
  const [activeTab, setActiveTab] = useState('analysis');
  
  return (
    <OfflineWorkspaceWrapper
      caseId={params.id}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    />
  );
}
```

That's it! The wrapper handles everything automatically.

### Step 4: Test Offline Functionality

1. **Login as Police Officer** (SHO or IO)
2. **Open a Case** - Navigate to any case detail page
3. **Verify Cache** - Look for console log: `[OfflineWorkspaceWrapper] Case {id} cached successfully`
4. **Go Offline** - DevTools → Network → Throttling → Offline
5. **Refresh Page** - Case should load from cache
6. **Make Changes** - Try updating a participant, adding diary entry, etc.
7. **Check Navbar** - Should show "X pending" in sync indicator
8. **Go Online** - Network → Throttling → Online
9. **Verify Sync** - Should show "Syncing..." then "Synced"
10. **Check Server** - Verify changes were applied

## 🎯 Quick Test Scenarios

### Scenario 1: Basic Offline Access
```
✓ Open case while online
✓ Go offline
✓ Refresh page
✓ Case loads from cache
✓ See "Offline Mode" indicator
```

### Scenario 2: Offline Mutations
```
✓ Go offline
✓ Add diary entry
✓ Update participant
✓ See "X pending" in navbar
✓ Refresh page
✓ Pending count persists
✓ Go online
✓ Changes sync automatically
```

### Scenario 3: Cache Eviction
```
✓ Open 6 different cases (one at a time)
✓ Check IndexedDB → cases table
✓ Should have only 5 cases
✓ Oldest case should be evicted
```

### Scenario 4: Evidence Download
```
✓ Open case with evidence
✓ Scroll to evidence section
✓ Click download button on evidence item
✓ File downloads to device
```

### Scenario 5: Logout Cleanup
```
✓ Cache some cases
✓ Add some offline mutations
✓ Logout
✓ Check IndexedDB
✓ All data for that officer cleared
```

## 🐛 Troubleshooting

### Service Worker Not Registering
```
Problem: PWA features not working
Solution:
1. Ensure running production build (npm run build && npm start)
2. Service workers only work on HTTPS or localhost
3. Clear browser cache (Ctrl+Shift+Del)
4. Hard reload (Ctrl+Shift+R)
```

### Cache Not Working
```
Problem: Case doesn't load offline
Solution:
1. Check console for "[OfflineWorkspaceWrapper]" logs
2. Verify case was cached: IndexedDB → CrimeOS_Offline → cases
3. Ensure officer_id is available in localStorage
4. Check browser console for errors
```

### Sync Not Happening
```
Problem: Pending operations not syncing
Solution:
1. Check you're actually online (navigator.onLine)
2. Check console for "[SyncManager]" and "[Outbox]" logs
3. Click sync button manually in navbar
4. Check failed operations: DevTools → Console
   > await OutboxManager.getFailedOperations(officer_id)
```

### TypeScript Errors
```
Problem: Build fails with type errors
Solution:
1. Check all officer_id parameters have proper null guards
2. Ensure @types/uuid is installed
3. Run: npx tsc --noEmit to see specific errors
```

## 📊 Monitoring After Deployment

### Check Sync Health
```tsx
// Add to admin dashboard or debug panel
import { OutboxManager, CaseCacheManager } from '@/lib/offline';

async function checkSyncHealth(officerId: string) {
  const pending = await OutboxManager.getPendingOperations(officerId);
  const failed = await OutboxManager.getFailedOperations(officerId);
  const cached = await CaseCacheManager.getCachedCasesForOfficer(officerId);
  
  console.log('Pending:', pending.length);
  console.log('Failed:', failed.length);
  console.log('Cached cases:', cached.length);
  
  return { pending, failed, cached };
}
```

### Monitor Cache Size
```js
// Browser console
const db = await indexedDB.open('CrimeOS_Offline');
const cases = await db.transaction('cases').objectStore('cases').count();
const outbox = await db.transaction('outbox').objectStore('outbox').count();
console.log(`Cases: ${cases}, Outbox: ${outbox}`);
```

### Clear Everything (Debug)
```js
// Browser console - nuclear option
await indexedDB.deleteDatabase('CrimeOS_Offline');
location.reload();
```

## 🎓 Training Users

### Key Points to Communicate

1. **Automatic Caching**
   - "Cases you view are automatically saved for offline access"
   - "We keep your 5 most recent cases available offline"

2. **Offline Indicators**
   - "Look for the status indicator in the top right"
   - "You'll see 'Offline' when disconnected"

3. **Pending Sync**
   - "Changes made offline will sync automatically when online"
   - "The number shows how many changes are waiting to sync"

4. **Manual Sync**
   - "Click the sync indicator to sync immediately"
   - "Useful if automatic sync didn't work"

5. **Evidence Downloads**
   - "Evidence files need to be downloaded manually"
   - "Click the download button next to each file"

## ✨ Optional Enhancements

### Add Sync Status to Case List
```tsx
import { CaseCacheManager } from '@/lib/offline';

function CaseListItem({ caseId, officerId }) {
  const [isCached, setIsCached] = useState(false);
  
  useEffect(() => {
    CaseCacheManager.isCaseCached(caseId, officerId)
      .then(setIsCached);
  }, [caseId, officerId]);
  
  return (
    <div className="case-item">
      {/* ... */}
      {isCached && <Badge>Available Offline</Badge>}
    </div>
  );
}
```

### Add Manual Cache Button
```tsx
import { CaseCacheManager } from '@/lib/offline';

function CacheButton({ caseId, officerId, caseData }) {
  const [caching, setCaching] = useState(false);
  
  const handleCache = async () => {
    setCaching(true);
    await CaseCacheManager.saveCase(caseId, officerId, caseData);
    setCaching(false);
  };
  
  return (
    <button onClick={handleCache} disabled={caching}>
      {caching ? 'Caching...' : 'Save for Offline'}
    </button>
  );
}
```

### Add Sync History
```tsx
import { db } from '@/lib/offline';

async function getSyncHistory(officerId: string) {
  const metadata = await db.metadata
    .where('key')
    .startsWith(`officer:${officerId}`)
    .toArray();
  
  return metadata;
}
```

## 📝 Final Checklist

Before marking as complete:

- [ ] Production build succeeds
- [ ] Service worker registered
- [ ] PWA installable
- [ ] Cases cached automatically
- [ ] Offline access works
- [ ] Mutations queue when offline
- [ ] Sync works when online
- [ ] Cache limited to 5 cases
- [ ] Logout clears cache
- [ ] Sync indicator shows in navbar
- [ ] Offline banner appears when offline
- [ ] Evidence download works
- [ ] No console errors
- [ ] Tested on Chrome
- [ ] Tested on mobile (if applicable)

---

**Ready for Production**: ✅ Yes (after testing)  
**Breaking Changes**: ❌ None  
**Rollback Strategy**: Simply don't use OfflineWorkspaceWrapper
