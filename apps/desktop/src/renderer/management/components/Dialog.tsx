import { useEffect, useRef, type ReactNode } from 'react';

/** Native modality keeps the persistent navigation inert and restores its trigger. */
export function Dialog({ label, className = '', onClose, children }: {
  label: string; className?: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const previous = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      const trigger = previous.current;
      if (!trigger?.isConnected) return;
      trigger.focus({ preventScroll: true });
      // Cancelling asynchronous work can re-enable the opener in the next React commit.
      if (document.activeElement !== trigger) requestAnimationFrame(() => { if (trigger.isConnected) trigger.focus({ preventScroll: true }); });
    };
  }, []);
  return <dialog ref={ref} aria-label={label} className={className}
    onCancel={event => { event.preventDefault(); close.current(); }}
    onClick={event => { if (event.target === ref.current) close.current(); }}>{children}</dialog>;
}
