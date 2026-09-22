import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Flex, Slider, Text } from '@radix-ui/themes';

export function PetSizeControl({ confirmedSize, preferenceError, disabled, visible, save, onSavingChange }: {
  confirmedSize: number;
  preferenceError: string | null;
  disabled: boolean;
  visible: boolean;
  save: (size: number) => Promise<string | null>;
  onSavingChange: (saving: boolean) => void;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const [committedPreview, setCommittedPreview] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(0);
  const sliderRoot = useRef<HTMLSpanElement>(null);
  const thumb = useRef<HTMLElement | null>(null);
  const pointer = useRef<number | null>(null);
  const restoreFocus = useRef(false);
  const queuedCommit = useRef<number | null>(null);
  const running = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; queuedCommit.current = null; };
  }, []);

  function cancelGesture(restore: boolean) {
    if (pointer.current === null) return;
    pointer.current = null;
    restoreFocus.current = restore && document.hasFocus() && document.activeElement === thumb.current;
    setDraft(null);
    // Radix 1.4.7 clears its cached track rect only on slideEnd, not cancellation.
    // Reset only an aborted gesture; ordinary release/save keeps the same thumb.
    setReset(value => value + 1);
  }
  useEffect(() => { if (!visible) cancelGesture(false); }, [visible]);
  useEffect(() => {
    let active = true;
    if (restoreFocus.current && visible) {
      // Let Radix register the replacement thumb's collection index before focus.
      queueMicrotask(() => {
        if (active && document.hasFocus() && document.activeElement === document.body) {
          thumb.current?.focus({ preventScroll: true });
        }
      });
    }
    restoreFocus.current = false;
    return () => { active = false; };
  }, [reset, visible]);

  async function commit(size: number) {
    queuedCommit.current = size;
    setCommittedPreview(size);
    if (running.current) return;
    running.current = true;
    setSaving(true); onSavingChange(true); setError('');
    try {
      // Only release/keyboard commits enter this queue, never pointer movement.
      while (mounted.current && queuedCommit.current !== null) {
        const next = queuedCommit.current;
        queuedCommit.current = null;
        const failure = await save(next);
        if (!mounted.current) return;
        if (failure) { queuedCommit.current = null; break; }
      }
    } catch {
      queuedCommit.current = null;
      if (mounted.current) setError('操作失败，未确认更改。请重试。');
    } finally {
      running.current = false;
      if (mounted.current) {
        // The independent pointer draft may belong to a newer, unreleased drag.
        setCommittedPreview(null); setSaving(false); onSavingChange(false);
      }
    }
  }

  const value = draft ?? committedPreview ?? confirmedSize;
  const failure = error || preferenceError;
  // Themes 3.3.0 owns the thumb and only forwards ref/ARIA props to Root.
  // Add accessible metadata to its actual slider, without replacing its geometry/events.
  useLayoutEffect(() => {
    thumb.current = sliderRoot.current?.querySelector<HTMLElement>('[role="slider"]') ?? null;
    thumb.current?.setAttribute('aria-labelledby', 'pet-size-label');
    thumb.current?.setAttribute('aria-describedby', 'pet-size-help');
    thumb.current?.setAttribute('aria-valuetext', `预览 ${value} DIP`);
  }, [value, reset]);
  return <Box mt="5">
    <Flex justify="between" gap="3" wrap="wrap">
      <Text id="pet-size-label">宠物大小</Text><Text asChild className="size-value"><output>预览 {value} DIP</output></Text>
    </Flex>
    <Slider ref={sliderRoot} key={reset} className="size-slider" min={80} max={600} step={1} my="3"
      disabled={disabled} value={[value]}
      onPointerDown={event => {
        if (disabled || event.button !== 0) { event.preventDefault(); return; }
        pointer.current = event.pointerId;
        setDraft(value);
      }}
      onPointerUp={event => {
        if (pointer.current !== event.pointerId) return;
        // Runs before Radix's slideEnd. Normal release's lostcapture is not cancellation.
        pointer.current = null;
        setDraft(null);
      }}
      onPointerCancel={event => { if (pointer.current === event.pointerId) cancelGesture(true); }}
      onLostPointerCapture={event => { if (pointer.current === event.pointerId) cancelGesture(true); }}
      onValueChange={values => {
        // Radix keyboard commits precede onValueChange; only pointer changes are drafts.
        if (pointer.current !== null) setDraft(values[0]!);
      }}
      onValueCommit={values => { void commit(values[0]!); }} />
    <Text as="div" size="2" color={failure ? 'red' : 'gray'} className="size-status" role={failure ? 'alert' : 'status'}>
      {failure || (saving ? '正在保存尺寸…' : draft !== null ? '预览中，松开后应用。' : '')}
    </Text>
    <Text as="p" color="gray" size="2" mt="3">已确认尺寸：{confirmedSize} DIP</Text>
    <Text as="p" color="gray" size="2" mt="3" id="pet-size-help">拖动仅预览数值，松开后应用到桌宠并保存；方向键直接应用。与宠物工具栏同步，较小屏幕会限制实际尺寸。</Text>
  </Box>;
}
