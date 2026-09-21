import { Box3, InterpolateLinear, Vector3, type AnimationClip, type Object3D } from 'three';

// The bundled robot has only LINEAR translations of its top-level Pet node.
// Their extrema are at keyframes, so this union includes the full success jump,
// not just the bind pose. This is deliberately not a custom-asset bounds solver.
export function bundledAnimationBounds(scene: Object3D, clips: readonly AnimationClip[]): Box3 {
  const pet = scene.getObjectByName('Pet');
  if (!pet || pet.parent !== scene) throw new Error('Unexpected bundled pet hierarchy');
  const rest = new Box3().setFromObject(scene);
  const envelope = rest.clone();
  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (track.name !== 'Pet.position' || track.getInterpolation() !== InterpolateLinear || track.getValueSize() !== 3) {
        throw new Error('Bundled animation bounds require linear root translations');
      }
      for (let index = 0; index < track.values.length; index += 3) {
        const offset = new Vector3().fromArray(track.values, index).sub(pet.position);
        envelope.union(rest.clone().translate(offset));
      }
    }
  }
  return envelope;
}
