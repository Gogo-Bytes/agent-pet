import { useEffect, useMemo } from 'react';
import { useAnimations } from '@react-three/drei';
import { LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Group } from 'three';
import { resolvePetAnimation, type PetAnimations } from '@agent-pet/pet-runtime';

/** Shared desktop/home/audition player. Drei alone owns mixer advancement and disposal. */
export function usePetAnimation(root: Group, clips: AnimationClip[], mappings: PetAnimations,
  request: string, reduced: boolean, replay = 0) {
  const instance = useMemo(() => ({ current: root }), [root]);
  const { actions, mixer } = useAnimations(clips, instance);
  useEffect(() => {
    let active = true;
    let playing: AnimationAction | undefined;
    function play(value: string) {
      // stop restores Three's original bound properties, including the default pose.
      playing?.stop(); playing = undefined;
      const resolved = resolvePetAnimation(value, mappings, clips.map(clip => clip.name));
      const next = resolved ? actions[resolved.clip] : undefined;
      if (!next || !resolved) return;
      playing = next;
      next.reset().setLoop(resolved.playback === 'once' ? LoopOnce : LoopRepeat, resolved.playback === 'once' ? 1 : Infinity);
      next.clampWhenFinished = false;
      next.play(); next.paused = reduced;
    }
    // Never rebind during mixer.update: it would capture the outgoing animated pose.
    const finished = (event: { action: AnimationAction }) => { queueMicrotask(() => {
      if (active && event.action === playing) play('idle');
    }); };
    mixer.addEventListener('finished', finished);
    play(request);
    return () => { active = false; mixer.removeEventListener('finished', finished); playing?.stop(); };
  }, [actions, mixer, root, clips, mappings, request, reduced, replay]);
}
