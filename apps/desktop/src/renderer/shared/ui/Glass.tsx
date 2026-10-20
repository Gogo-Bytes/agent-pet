import { forwardRef, type ForwardedRef, type ComponentPropsWithoutRef, type CSSProperties, useId, useLayoutEffect, useRef, useState } from 'react';
import './glass.css';

type Material = 'control' | 'panel';
const classes = (material: Material, className?: string) =>
  `glass-surface glass-${material}${className ? ` ${className}` : ''}`;

type LensMap = { width: number; height: number; image: string };

/** A rounded bezel bends only background pixels; the middle remains neutral. */
function makeLensMap(width: number, height: number, radius: number): LensMap | null {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const pixels = context.createImageData(width, height);
  const halfX = width / 2, halfY = height / 2;
  const r = Math.min(radius, halfX, halfY);
  const bezel = Math.min(9, halfY * .35);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = x + .5 - halfX, py = y + .5 - halfY;
    const qx = Math.abs(px) - halfX + r, qy = Math.abs(py) - halfY + r;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    const length = Math.hypot(ox, oy);
    const distance = -(length + Math.min(Math.max(qx, qy), 0) - r);
    const nx = length > 0 ? ox / length : qx > qy ? 1 : 0;
    const ny = length > 0 ? oy / length : qx > qy ? 0 : 1;
    const bend = distance > 0 && distance < bezel ? Math.sin(Math.PI * distance / bezel) * .7 : 0;
    const index = (y * width + x) * 4;
    pixels.data[index] = Math.round(128 - Math.sign(px) * nx * bend * 127);
    pixels.data[index + 1] = Math.round(128 - Math.sign(py) * ny * bend * 127);
    pixels.data[index + 2] = 128; pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return { width, height, image: canvas.toDataURL() };
}

function useLens(material: Material, enabled = true) {
  const ref = useRef<HTMLElement>(null);
  const id = `glass-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [map, setMap] = useState<LensMap | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element || material !== 'control' || typeof ResizeObserver === 'undefined') { setMap(null); return; }
    let frame = 0;
    let previous = '';
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = element.clientWidth, height = element.clientHeight;
        const style = getComputedStyle(element);
        const value = style.borderTopLeftRadius;
        const radius = Math.max(0, (value.endsWith('%') ? parseFloat(value) * Math.min(width, height) / 100 : parseFloat(value)) - parseFloat(style.borderLeftWidth));
        const key = `${width}:${height}:${radius}`;
        if (!width || !height || width * height > 256_000 || !Number.isFinite(radius)) {
          previous = ''; setMap(null); return;
        }
        if (key === previous) return;
        previous = key;
        setMap(makeLensMap(width, height, radius));
      });
    });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [enabled, material]);
  const optics = <>
    {map && <svg className="glass-filter-defs" aria-hidden="true" focusable="false"><defs>
      <filter id={id} x="0" y="0" width={map.width} height={map.height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feImage href={map.image} width={map.width} height={map.height} preserveAspectRatio="none" result="bezel" />
        <feDisplacementMap in="SourceGraphic" in2="bezel" scale="12" xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation=".45" />
      </filter>
    </defs></svg>}
    <span className="glass-optics" aria-hidden="true" style={{ '--glass-filter': map ? `url(#${id})` : 'blur(.6px)' } as CSSProperties} />
  </>;
  return { ref, optics };
}

type SurfaceProps = ComponentPropsWithoutRef<'div'> & { as?: 'div' | 'section' | 'span'; material?: Material };

/** Material only: placement and dimensions belong to the consuming layout. */
export function GlassSurface({ as: Element = 'div', material = 'control', className, ...props }: SurfaceProps) {
  const { ref, optics } = useLens(material);
  return <Element ref={node => { ref.current = node; }} className={classes(material, className)} {...props}>{optics}{props.children}</Element>;
}

function assignRef<T>(ref: ForwardedRef<T>, node: T | null) {
  if (typeof ref === 'function') ref(node);
  else if (ref) ref.current = node;
}

type ButtonProps = ComponentPropsWithoutRef<'button'> & { material?: Material; flat?: boolean };
export const GlassButton = forwardRef<HTMLButtonElement, ButtonProps>(function GlassButton({ material = 'control', flat = false, className, type = 'button', ...props }, forwardedRef) {
  const { ref, optics } = useLens(material, !flat);
  const buttonClass = flat ? `flat-control${className ? ` ${className}` : ''}` : `${classes(material, className)} glass-button`;
  return <button ref={node => { ref.current = node; assignRef(forwardedRef, node); }} type={type} className={`${buttonClass}${flat ? ' glass-button' : ''}`} {...props}>{flat ? null : optics}{props.children}</button>;
});

/** Children use transparent native buttons, so this group filters the backdrop once. */
export const GlassToolbar = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(function GlassToolbar({ className, ...props }, forwardedRef) {
  const { ref, optics } = useLens('control');
  return <div ref={node => { ref.current = node; assignRef(forwardedRef, node); }} role="group" className={`${classes('control', className)} glass-toolbar`} {...props}>{optics}{props.children}</div>;
});

/** Transparent native action inside one shared material; never another lens. */
type ActionProps = ComponentPropsWithoutRef<'button'> & { iconOnly?: boolean };
export const GlassAction = forwardRef<HTMLButtonElement, ActionProps>(function GlassAction({ className = '', iconOnly = false, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={`glass-action${iconOnly ? ' icon-only' : ''}${className ? ` ${className}` : ''}`} {...props} />;
});
