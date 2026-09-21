import { forwardRef, type HTMLAttributes } from 'react';
import styles from './GlassSurface.module.css';

export const glassSurfaceClass = styles.surface;
export const GlassSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function GlassSurface({ className = '', ...props }, ref) {
  return <div ref={ref} className={`${styles.surface} ${className}`} {...props} />;
});
