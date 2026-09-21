import { useEffect, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { Rect } from '../../../shared/overlay-layout.js';
import { rectStyle } from '../rect-style.js';
import styles from './Tooltip.module.css';

// The portal is confined to Main's always-hit pet rectangle, not the document
// viewport (which may extend past the native window in fixture previews).
export function Tooltip({ label, rect, children, disabled = false }: {
  label: string; rect: Rect | undefined; children: ReactElement; disabled?: boolean;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return <RadixTooltip.Provider delayDuration={400} disableHoverableContent>
    <RadixTooltip.Root open={!disabled && open} onOpenChange={value => setOpen(!disabled && value)}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      {createPortal(<div ref={setContainer} className={styles.portal} data-tooltip-region="pet" style={rectStyle(rect)} />, document.body)}
      {container && rect && <RadixTooltip.Portal container={container}>
        <RadixTooltip.Content className={styles.content} avoidCollisions={false}>
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>}
    </RadixTooltip.Root>
  </RadixTooltip.Provider>;
}
