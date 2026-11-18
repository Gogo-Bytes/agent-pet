import { useGLTF } from '@react-three/drei';

export function releaseModelUrl(url: string): void {
  useGLTF.clear(url);
  URL.revokeObjectURL(url);
}
