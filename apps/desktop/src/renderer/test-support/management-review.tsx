/** Disposable browser test boundary. Electron production entries never import this fixture. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ManagementApp } from '../management/ManagementApp.js';
import '../management/management.css';
import { createReviewBridge } from './review-bridge.js';
createRoot(document.getElementById('app')!).render(<StrictMode><ManagementApp bridge={createReviewBridge(new URLSearchParams(location.search).get('case') ?? 'online')} /></StrictMode>);
