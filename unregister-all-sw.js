// Run this in Chrome Console to unregister all service workers
(async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log(`Found ${registrations.length} service worker(s) to unregister`);
      
      for (let registration of registrations) {
        const unregistered = await registration.unregister();
        console.log(`Unregistered service worker: ${registration.scope} - Success: ${unregistered}`);
      }
      
      // Also clear all caches
      const cacheNames = await caches.keys();
      console.log(`Found ${cacheNames.length} cache(s) to delete`);
      
      for (let cacheName of cacheNames) {
        await caches.delete(cacheName);
        console.log(`Deleted cache: ${cacheName}`);
      }
      
      console.log('✅ All service workers unregistered and caches cleared!');
      console.log('Now refresh the page (Cmd+R or F5)');
    } catch (error) {
      console.error('Error unregistering service workers:', error);
    }
  } else {
    console.log('Service workers not supported in this browser');
  }
})();


