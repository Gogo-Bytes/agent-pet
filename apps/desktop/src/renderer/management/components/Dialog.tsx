import { useEffect, useRef, type ReactNode } from 'react';

/** Native modality keeps the persistent navigation inert and restores its trigger. */
export function Dialog({ label, className = '', onClose, children }: {
  label: string; className?: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} aria-label={label} className={className}
    onCancel={event => { event.preventDefault(); close.current(); }}
    onClick={event => { if (event.target === ref.current) close.current(); }}>{children}</dialog>;
}
