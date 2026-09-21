import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ManagementApp } from './ManagementApp.js';
import '../shared/styles/tokens.css';
import './management.css';
createRoot(document.getElementById('app')!).render(<StrictMode><ManagementApp /></StrictMode>);
