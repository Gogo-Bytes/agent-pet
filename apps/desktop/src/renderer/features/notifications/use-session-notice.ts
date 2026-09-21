import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionRef } from '@agent-pet/adapter-core';
import type { PetBridge } from '../../app/bridge/pet-store.js';

const messages = {
  success: '', unsupported: '暂不支持跳转原会话',
  'not-found': '找不到对应 Session。', 'permission-denied': '没有打开窗口的权限。',
};
export function useSessionNotice(bridge: PetBridge) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const request = useRef(0);
  useEffect(() => {
    ++generation.current;
    // Effect restarts (including Fast Refresh) retain state after timer cleanup.
    setMessage(null);
    return () => { ++generation.current; clearTimeout(timer.current); };
  }, [bridge]);
  const openSession = useCallback(async (session: SessionRef) => {
    const current = generation.current;
    const latest = ++request.current;
    let text: string;
    try { text = messages[(await bridge.acknowledgeAndOpen(session)).status]; }
    catch { text = '暂时无法打开原会话窗口'; }
    if (current !== generation.current || latest !== request.current) return;
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => { setMessage(null); }, 3500);
  }, [bridge]);
  return { message, openSession };
}
