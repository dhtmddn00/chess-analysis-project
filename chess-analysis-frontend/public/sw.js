const CACHE_NAME = 'chess-analysis-pro-v1';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/chess-icon-192.png',
  '/chess-icon-512.png'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Service Worker: Cache failed', error);
      })
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  console.log('Service Worker: Fetching', event.request.url);
  
  // Skip caching for API requests
  if (event.request.url.includes('/api/')) {
    return fetch(event.request);
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
      .catch(() => {
        // Fallback for offline mode
        if (event.request.destination === 'document') {
          return caches.match('/');
        }
      })
  );
});

// Activate Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Background Sync for failed analysis requests
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'chess-analysis-retry') {
    event.waitUntil(
      // Retry failed analysis requests
      retryFailedAnalysis()
    );
  }
});

async function retryFailedAnalysis() {
  try {
    // Get failed requests from IndexedDB and retry
    const failedRequests = await getFailedRequests();
    
    for (const request of failedRequests) {
      try {
        await fetch('/api/analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request.data)
        });
        
        // Remove from failed requests on success
        await removeFailedRequest(request.id);
      } catch (error) {
        console.error('Service Worker: Retry failed', error);
      }
    }
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}

// Notification handling
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked', event.notification.tag);
  
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/analysis/' + event.notification.tag)
  );
});

// Push notification handling
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');
  
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'Your chess analysis is complete!',
      icon: '/chess-icon-192.png',
      badge: '/chess-icon-192.png',
      tag: data.analysisId,
      requireInteraction: true,
      actions: [
        {
          action: 'view',
          title: 'View Results',
          icon: '/chess-icon-192.png'
        },
        {
          action: 'close',
          title: 'Close'
        }
      ],
      data: {
        analysisId: data.analysisId,
        url: '/analysis/' + data.analysisId
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Chess Analysis Pro', options)
    );
  }
});

// Helper functions for IndexedDB operations
async function getFailedRequests() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chess-analysis-cache', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['failedRequests'], 'readonly');
      const store = transaction.objectStore('failedRequests');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('failedRequests')) {
        db.createObjectStore('failedRequests', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function removeFailedRequest(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chess-analysis-cache', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['failedRequests'], 'readwrite');
      const store = transaction.objectStore('failedRequests');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };
  });
}