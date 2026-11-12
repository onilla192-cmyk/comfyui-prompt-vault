/* How the React application starts and mounts the main App component. */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Remove the legacy Workbox service worker that can keep serving an older
// Datasets screen after a deployment. Reload once after unregistering it so
// the browser requests the current Cloudflare Pages assets.
async function clearStaleAppShell() {
  if (!('serviceWorker' in navigator)) return
  const marker = 'prompt-vault-cache-refresh-v1'
  if (sessionStorage.getItem(marker)) return
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    if (!registrations.length) return
    await Promise.all(registrations.map((registration) => registration.unregister()))
    if ('caches' in window) {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => /workbox|vite-pwa/i.test(name)).map((name) => caches.delete(name)))
    }
    sessionStorage.setItem(marker, '1')
    window.location.reload()
  } catch {
    // If browser cache APIs are unavailable, keep the app usable.
  }
}

void clearStaleAppShell().then(() => {
  if (sessionStorage.getItem('prompt-vault-cache-refresh-v1') === '1') return
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
