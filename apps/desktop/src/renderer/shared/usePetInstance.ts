import { useEffect, useMemo } from 'react';
import { SkinnedMesh, type Group } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export function usePetInstance(scene: Group): Group {
  const root = useMemo(() => clone(scene) as Group, [scene]);
  useEffect(() => () => {
    // Skeletons belong to the clone; geometry, materials and their textures are shared.
    root.traverse(node => { if (node instanceof SkinnedMesh) node.skeleton.dispose(); });
  }, [root]);
  return root;
}
