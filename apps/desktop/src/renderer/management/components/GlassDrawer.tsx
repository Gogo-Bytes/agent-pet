import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { GlassAction, GlassSurface } from './glass.js';
import { Icon } from './icons.js';
import './drawer.css';

/** Native modality stays active through exit, then restores the opener exactly once. */
export function GlassDrawer({ label, reduced, onClose, children }: {
  label: string; reduced: boolean; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previous = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const close = useRef(onClose); close.current = onClose;
  const exiting = useRef(false);
  const finished = useRef(false);
  const [closing, setClosing] = useState(false);
  function finish() {
    if (finished.current) return;
    finished.current = true;
    close.current();
  }
  function requestClose() {
    if (exiting.current) return;
    exiting.current = true;
    if (reduced || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) finish();
    else setClosing(true);
  }
  useLayoutEffect(() => {
    const node = dialog.current!;
    const host = node.parentElement!;
    const resize = () => {
      const bounds = host.getBoundingClientRect();
      Object.assign(node.style, { left: bounds.left + 'px', top: bounds.top + 'px', width: bounds.width + 'px', height: bounds.height + 'px' });
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(host);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => {
    const node = dialog.current!;
    finished.current = false; exiting.current = false;
    node.showModal();
    node.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus({ preventScroll: true });
    return () => { node.close(); if (previous.current?.isConnected) previous.current.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (!closing) return;
    // Covers animation cancellation, disabled animations and lost animationend.
    const timer = window.setTimeout(finish, reduced ? 0 : 280);
    return () => clearTimeout(timer);
  }, [closing, reduced]);
  return <dialog ref={dialog} aria-label={label} className="glass-drawer" data-closing={closing}
    onCancel={event => { event.preventDefault(); requestClose(); }}
    onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <GlassSurface material="panel" className="glass-drawer-panel" data-closing={closing}
      onAnimationEnd={event => { if (closing && event.target === event.currentTarget && event.animationName === 'glass-drawer-out') finish(); }}>
      <div className="glass-drawer-content">
        <header><h2>{label}</h2><GlassAction aria-label="关闭弹窗" onClick={requestClose}><Icon name="close" /></GlassAction></header>
        {children}
      </div>
    </GlassSurface>
  </dialog>;
}
