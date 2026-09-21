import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import { createPetStore } from './app/bridge/pet-store.js';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Renderer root is missing');
const root = createRoot(app);
const store = createPetStore(window.pet);
root.render(<StrictMode><App store={store} /></StrictMode>);
function unmount() {
  window.removeEventListener('beforeunload', unmount);
  root.unmount();
}
window.addEventListener('beforeunload', unmount);
if (import.meta.hot) import.meta.hot.dispose(unmount);
