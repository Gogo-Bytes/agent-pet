import { useEffect, useMemo, useRef } from 'react';
import { useAnimations } from '@react-three/drei';
import { LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Group } from 'three';
import { resolvePetAnimation, normalizePetAction, petActionCatalog, type PetAnimations, type ResolvedPetAnimation } from '@agent-pet/pet-runtime';
import type { PetInteraction } from './usePetInteraction.js';

// Renderer-local cue memory survives remounts; numeric audition counters are replayable.
const playedCues = new Set<string>();
function rememberCue(key: string) {
  playedCues.add(key);
  if (playedCues.size > 256) playedCues.delete(playedCues.values().next().value!);
}

type Target = { animation: ResolvedPetAnimation | null; key: string; once: boolean; local: PetInteraction | null; cue?: string };

/** Shared desktop/home/audition player. Drei owns mixer advancement and disposal. */
export function usePetAnimation(root: Group, clips: AnimationClip[], mappings: PetAnimations,
  request: string, reduced: boolean, replay: string | number = 0, restAction = 'idle',
  interaction: PetInteraction | null = null, onInteractionFinished?: () => void, connectionCue?: string,
  reset = 0, visible = true) {
  const names = useMemo(() => clips.map(clip => clip.name), [clips]);
  const local = interaction && !reduced && resolvePetAnimation(interaction.action, mappings, names)?.action === interaction.action ? interaction : null;
  const connection = useMemo(() => connectionCue && !playedCues.has(connectionCue) && !reduced && !local &&
    (request === 'idle' || request === 'presence') ? connectionCue : undefined, [connectionCue, request, reduced, local]);
  useEffect(() => {
    let active = true;
    // Superseded, missing or reduced connection cues never queue for later idle.
    if (connectionCue) queueMicrotask(() => { if (active) rememberCue(connectionCue); });
    return () => { active = false; };
  }, [connectionCue]);
  const input = useRef({ request, replay, restAction, local, reduced, onInteractionFinished, connection, reset, visible });
  input.current = { request, replay, restAction, local, reduced, onInteractionFinished, connection, reset, visible };
  const synchronize = useRef<() => void>(() => {});
  const instance = useMemo(() => ({ current: root }), [root]);
  const { actions, mixer } = useAnimations(clips, instance);

  useEffect(() => {
    let active = true;
    let playing: AnimationAction | undefined;
    let current: Target | null = null;
    let pending: Target | null = null;
    let phase: 'in' | 'loop' | 'out' | 'once' = 'loop';
    let generation = 0;
    let lastReset = input.current.reset;
    let lastReduced = input.current.reduced;
    let lastVisible = input.current.visible;
    let displayedCue: string | undefined;
    let finishedLocal: PetInteraction | null = null;
    let lastRequestKey = '';
    let completedKey: string | null = null;

    function target(value: string, replay: string | number = 0, feedback: PetInteraction | null = null): Target {
      const requested = normalizePetAction(value);
      const cue = typeof replay === 'string' && replay ? replay : undefined;
      const oneShot = !!cue || (requested !== undefined && petActionCatalog[requested].playback === 'once');
      const animation = resolvePetAnimation(value, mappings, names);
      // A recent tool event without its own clip is not evidence of ongoing work.
      if (cue && requested && petActionCatalog[requested].playback === 'loop' && animation?.action !== requested) {
        return { ...target(input.current.restAction), cue };
      }
      // A missing transient must not interrupt current work with the idle fallback.
      if (oneShot && input.current.restAction !== value && input.current.restAction !== 'idle' && (!animation || animation.action === 'idle')) {
        return { ...target(input.current.restAction), ...(cue ? { cue } : {}) };
      }
      const once = animation?.playback === 'once' || (oneShot && (animation?.action === requested || animation?.action === 'attention'));
      return { animation, once, local: feedback,
        key: `${animation?.action ?? 'static'}:${once ? value : 'loop'}:${typeof replay === 'number' && replay !== 0 ? replay : cue ?? ''}`,
        ...(cue ? { cue } : {}) };
    }
    function desired(): Target {
      const value = input.current;
      if (value.local && value.local !== finishedLocal && !value.reduced && value.visible) return target(value.local.action, 0, value.local);
      const next = target(value.connection ? 'connected' : value.request, value.connection ?? value.replay);
      if (next.key !== lastRequestKey) { lastRequestKey = next.key; completedKey = null; }
      return next.key === completedKey || (next.cue && playedCues.has(next.cue) && next.cue !== displayedCue) ? target(value.restAction) : next;
    }
    function play(clip: string | undefined, nextPhase: typeof phase, once: boolean) {
      generation++;
      playing?.stop();
      playing = clip ? actions[clip] ?? undefined : undefined;
      phase = nextPhase;
      if (!playing) return;
      playing.reset().setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
      // Keep the completion pose until the deferred handoff; never rebind inside update().
      playing.clampWhenFinished = once;
      playing.play();
      playing.paused = input.current.reduced || !input.current.visible;
      mixer.update(0);
    }
    function body(next: Target) {
      current = next;
      pending = null;
      play(next.animation?.clip, next.once ? 'once' : 'loop', next.once);
    }
    function enter(next: Target, skipIn = false) {
      current = next;
      pending = null;
      displayedCue = next.cue;
      if (next.cue) {
        const cue = next.cue;
        queueMicrotask(() => { if (active) rememberCue(cue); });
      }
      if (!skipIn && !next.once && !next.local && next.animation?.in && !input.current.reduced && input.current.visible) play(next.animation.in, 'in', true);
      else body(next);
    }
    function sync() {
      const value = input.current;
      const hard = value.reset !== lastReset || value.reduced !== lastReduced || value.visible !== lastVisible;
      if ((lastReduced && !value.reduced) || (!lastVisible && value.visible)) displayedCue = undefined;
      lastReset = value.reset; lastReduced = value.reduced; lastVisible = value.visible;
      const next = desired();
      if (hard || value.reduced || !value.visible) {
        enter(next.local ? target(value.restAction) : next, true);
        return;
      }
      if (current?.local && next.local === current.local) return;
      if (!current?.local && !next.local && current?.key === next.key) {
        if (next.cue) {
          const cue = next.cue;
          queueMicrotask(() => { if (active) rememberCue(cue); });
        }
        if (phase === 'out') body(next);
        return;
      }
      // Local feedback overlays the sustained state; it never causes out/in.
      if (next.local || current?.local) { enter(next, !!current?.local); return; }
      const requested = normalizePetAction(value.request);
      const immediate = requested === 'dragging' || requested === 'error' || requested === 'tool_error' || requested === 'output_limited' || requested === 'cancelled';
      if (immediate) { enter(next); return; }
      if (phase === 'out') { pending = next; return; }
      if (phase === 'loop' && current?.animation?.out) {
        pending = next;
        play(current.animation.out, 'out', true);
      } else enter(next);
    }
    const finished = (event: { action: AnimationAction }) => {
      const stamp = generation;
      queueMicrotask(() => {
        if (!active || stamp !== generation || event.action !== playing || !current) return;
        if (phase === 'in') body(current);
        else if (phase === 'out') { if (pending) enter(pending); }
        else if (phase === 'once') {
          if (current.local) {
            finishedLocal = current.local;
            input.current.onInteractionFinished?.();
            enter(desired(), true);
          } else {
            completedKey = current.key;
            displayedCue = undefined;
            enter(desired());
          }
        }
      });
    };
    function cancel() {
      if (current?.local) { finishedLocal = current.local; input.current.onInteractionFinished?.(); }
      if (current?.once) completedKey = current.key;
      displayedCue = undefined;
      const request = normalizePetAction(input.current.request);
      const eventRequest = typeof input.current.replay === 'string' && input.current.replay !== '';
      enter(target(!eventRequest && request && request !== 'dragging' && petActionCatalog[request].playback === 'loop' ? request : input.current.restAction), true);
    }
    const visibility = () => { if (document.hidden) cancel(); };
    mixer.addEventListener('finished', finished);
    window.addEventListener('blur', cancel);
    window.addEventListener('pointercancel', cancel);
    document.addEventListener('visibilitychange', visibility);
    synchronize.current = sync;
    return () => {
      active = false; generation++;
      synchronize.current = () => {};
      mixer.removeEventListener('finished', finished);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('pointercancel', cancel);
      document.removeEventListener('visibilitychange', visibility);
      playing?.stop();
    };
  }, [actions, mixer, root, clips, mappings, names]);

  useEffect(() => { synchronize.current(); }, [actions, mixer, root, clips, mappings, request, replay, restAction, local, reduced, connection, reset, visible]);
}
