# Clear Service Worker Cache

If you're seeing the dinosaur/no internet page when going offline, the service worker from a previous build is likely causing issues.

## Steps to Clear Service Worker

### Option 1: Chrome DevTools (Recommended)
1. Open DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers** in left sidebar
4. Click **Unregister** on all service workers
5. Click **Clear storage** in left sidebar
6. Check all boxes
7. Click **Clear site data**
8. Close DevTools
9. Hard refresh (Ctrl+Shift+R)

### Option 2: Manual Unregister Script
Open browser console and run:
```javascript
navigator.serviceWorker.getRegistrations().then(function(registrations) {
  for(let registration of registrations) {
    registration.unregister();
    console.log('Unregistered:', registration);
  }
});
```

Then:
```javascript
caches.keys().then(function(names) {
  for (let name of names) {
    caches.delete(name);
    console.log('Deleted cache:', name);
  }
});
```

### Option 3: Fresh Browser Session
1. Open Incognito/Private window
2. Test there (no service worker cache)

## After Clearing

1. **Rebuild** the app:
   ```bash
   npm run build
   npm start
   ```

2. **Test**:
   - Open case online
   - Check console for cache logs
   - Go offline
   - Tab should still work (data from IndexedDB, not service worker)

## Important Note

The offline functionality works through **IndexedDB** for data, not service worker caching of HTML pages. The service worker is only for PWA install, not for offline data access.
