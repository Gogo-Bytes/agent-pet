import { useEffect, useMemo, useRef } from 'react';
import { useAnimations } from '@react-three/drei';
import { LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Group } from 'three';
import { resolvePetAnimation, normalizePetAction, petActionCatalog, type PetAnimations } from '@agent-pet/pet-runtime';
import type { PetInteraction } from './usePetInteraction.js';

// Renderer-local, bounded cue memory survives scene/page remounts. Explicit audition
// uses numeric replay counters and is never consumed as a business notification.
const playedCues = new Set<string>();
function rememberCue(key: string) {
  playedCues.add(key);
  if (playedCues.size > 256) playedCues.delete(playedCues.values().next().value!);
}

/** Shared desktop/home/audition player. Drei alone owns mixer advancement and disposal. */
export function usePetAnimation(root: Group, clips: AnimationClip[], mappings: PetAnimations,
  request: string, reduced: boolean, replay: string | number = 0, restAction = 'idle',
  interaction: PetInteraction | null = null, onInteractionFinished?: () => void) {
  // Absent local clips must not reset ongoing work or consume a pending business cue.
  const local = interaction && !reduced && resolvePetAnimation(interaction.action, mappings, clips.map(clip => clip.name))?.action === interaction.action ? interaction : null;
  const playbackRequest = local?.action ?? request;
  const playbackReplay = local ? 0 : replay;
  const rest = useRef(restAction);
  rest.current = restAction;
  const instance = useMemo(() => ({ current: root }), [root]);
  const { actions, mixer } = useAnimations(clips, instance);
  useEffect(() => {
    let active = true;
    let playing: AnimationAction | undefined;
    function play(value: string) {
      // stop restores Three's original bound properties, including the default pose.
      playing?.stop(); playing = undefined;
      const resolved = resolvePetAnimation(value, mappings, clips.map(clip => clip.name));
      const requested = normalizePetAction(value);
      const oneShot = requested && petActionCatalog[requested].playback === 'once';
      // Missing transient animation must not interrupt the current running activity.
      if (oneShot && rest.current !== value && rest.current !== 'idle' && (!resolved || resolved.action === 'idle')) { play(rest.current); return; }
      const next = resolved ? actions[resolved.clip] : undefined;
      if (!next || !resolved) return;
      playing = next;
      const once = resolved.playback === 'once' || (oneShot && resolved.action === 'attention');
      next.reset().setLoop(once ? LoopOnce : LoopRepeat, once ? 1 : Infinity);
      next.clampWhenFinished = false;
      next.play(); next.paused = reduced;
    }
    // Never rebind during mixer.update: it would capture the outgoing animated pose.
    const finished = (event: { action: AnimationAction }) => { queueMicrotask(() => {
      if (active && event.action === playing) {
        if (local) onInteractionFinished?.();
        else play(rest.current);
      }
    }); };
    mixer.addEventListener('finished', finished);
    const requested = normalizePetAction(playbackRequest);
    const cue = typeof playbackReplay === 'string' && playbackReplay && requested && petActionCatalog[requested].playback === 'once' ? playbackReplay : undefined;
    if (cue && playedCues.has(cue)) play(rest.current);
    else {
      play(playbackRequest);
      // StrictMode's discarded effect cannot consume a cue before the real setup.
      if (cue) queueMicrotask(() => { if (active) rememberCue(cue); });
    }
    return () => { active = false; mixer.removeEventListener('finished', finished); playing?.stop(); };
  }, [actions, mixer, root, clips, mappings, playbackRequest, reduced, playbackReplay, local, onInteractionFinished]);
}
