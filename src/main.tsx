// Global fetch interceptor to dynamically rewrite relative /api/ requests to VITE_API_URL in production
const originalFetch = window.fetch;
window.fetch = function (input, init) {
  if (typeof input === 'string' && input.startsWith('/api/')) {
    const apiBase = (import.meta as any).env.VITE_API_URL || '';
    if (apiBase) {
      input = `${apiBase.replace(/\/$/, '')}${input}`;
    }
  }
  return originalFetch(input, init);
};

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered successfully!', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}
