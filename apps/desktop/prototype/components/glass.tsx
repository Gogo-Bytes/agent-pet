import type { ComponentPropsWithoutRef } from 'react';
import './glass.css';

type Material = 'control' | 'panel';
const classes = (material: Material, className?: string) =>
  `glass-surface glass-${material}${className ? ` ${className}` : ''}`;

type SurfaceProps = ComponentPropsWithoutRef<'div'> & {
  as?: 'div' | 'section' | 'span';
  material?: Material;
};

/** Material only: placement and dimensions belong to the consuming layout. */
export function GlassSurface({ as: Element = 'div', material = 'control', className, ...props }: SurfaceProps) {
  return <Element className={classes(material, className)} {...props} />;
}

export function GlassButton({ className, type = 'button', ...props }: ComponentPropsWithoutRef<'button'>) {
  return <button type={type} className={`${classes('control', className)} glass-button`} {...props} />;
}

/** Children use transparent native buttons, so this group filters the backdrop once. */
export function GlassToolbar({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div role="group" className={`${classes('control', className)} glass-toolbar`} {...props} />;
}
