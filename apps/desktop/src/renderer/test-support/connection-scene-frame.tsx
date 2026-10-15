import { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ManagementApp } from '../management/ManagementApp.js';
import '../management/management.css';
import { createConnectionDemoBridge } from './connection-demo-bridge.js';
import { findConnectionScene } from './connection-scenes-data.js';
import { stageConnectionScene } from './stage-connection-scene.js';

const scene = findConnectionScene(new URLSearchParams(location.search).get('scene'));
function Scene() {
  const bridge = useMemo(() => createConnectionDemoBridge(scene[0]), []);
  useEffect(() => {
    const controller = new AbortController();
    const report = (status: string) => { document.documentElement.dataset.sceneStatus = status; parent.postMessage({ type: 'connection-scene', scene: scene[0], status }, location.origin); };
    report('loading');
    void stageConnectionScene(scene[0], controller.signal).then(() => report('ready')).catch(error => {
      if (!controller.signal.aborted) { report('error'); document.getElementById('scene-error')!.textContent = `${error.message}。请用目录中的「重新打开」重试。`; }
    });
    return () => controller.abort();
  }, []);
  return <ManagementApp bridge={bridge} />;
}
createRoot(document.getElementById('app')!).render(<Scene />);
