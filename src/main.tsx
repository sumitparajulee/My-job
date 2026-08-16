import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

// Registered here rather than left to a bundler plugin — this app has no
// server-rendered data to worry about invalidating, so a hand-written SW
// (see public/sw.js) is simpler than pulling in vite-plugin-pwa.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability is a nice-to-have, not a requirement — if
      // registration fails (e.g. unsupported browser) the app still
      // works normally as a regular tab.
    });
  });
}
