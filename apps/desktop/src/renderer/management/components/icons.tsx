import type { CSSProperties, ReactNode } from 'react';

export type IconName = 'minus' | 'maximize' | 'home' | 'pet' | 'link' | 'settings' | 'grid' | 'left' | 'right' | 'plus' | 'close' | 'search' | 'play' | 'replay' | 'up' | 'down' | 'check' | 'clock' | 'alert' | 'folder' | 'signal' | 'sleep' | 'monitor' | 'software' | 'gauge' | 'bell' | 'info' | 'leaf' | 'sparkles' | 'scan' | 'edit' | 'trash' | 'verified' | 'help' | 'loader' | 'command' | 'flower' | 'code' | 'diagonal' | 'pi';

// Rounded silhouettes for navigation; simple strokes for directional actions.
const glyphs: Record<IconName, ReactNode> = {
  home: <><path opacity=".24" d="M3.5 9.6 10 4.1a3 3 0 0 1 4 0l6.5 5.5a2.5 2.5 0 0 1 .8 2.4l-1.1 7a3 3 0 0 1-3 2.5H6.8a3 3 0 0 1-3-2.5l-1.1-7a2.5 2.5 0 0 1 .8-2.4Z"/><path d="M9 21.5V15a3 3 0 0 1 6 0v6.5Z"/></>,
  pet: <><g opacity=".42"><ellipse cx="5.1" cy="9" rx="2.5" ry="3.1" transform="rotate(-25 5.1 9)"/><ellipse cx="10" cy="5.5" rx="2.3" ry="3"/><ellipse cx="15.5" cy="6" rx="2.3" ry="3" transform="rotate(12 15.5 6)"/><ellipse cx="20" cy="10" rx="2.3" ry="2.8" transform="rotate(28 20 10)"/></g><path d="M5.5 16c1.5-2.1 2.8-5 6.5-5s5 2.9 6.5 5c2.7 3.7-.1 6.5-3.5 5.1a8 8 0 0 0-6 0C5.6 22.5 2.8 19.7 5.5 16Z"/></>,
  link: <><path opacity=".25" d="m14.2 4.2 1.6-1.1a4.4 4.4 0 0 1 6.2 6.2l-4.5 4.5a4.4 4.4 0 0 1-6.2 0L9.8 12Z"/><g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9.2 14.8 5.6-5.6M8.4 7.8 5 11.2a4.2 4.2 0 0 0 5.9 6l3.4-3.4M15.6 16.2l3.4-3.4a4.2 4.2 0 0 0-5.9-6l-3.4 3.4"/></g></>,
  settings: <><g opacity=".25"><rect x="2" y="5" width="20" height="5" rx="2.5"/><rect x="2" y="14" width="20" height="5" rx="2.5"/></g><circle cx="8" cy="7.5" r="3.5"/><circle cx="16" cy="16.5" r="3.5"/></>,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="2.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.5" opacity=".4"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.5" opacity=".4"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.5"/></>,
  search: <><circle cx="10.5" cy="10.5" r="7" opacity=".16"/><g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.3"/><path d="m15.3 15.3 4.2 4.2"/></g></>,
  play: <path d="M7 5.8c0-1.4 1.5-2.2 2.7-1.5l10.2 6.2c1.1.7 1.1 2.3 0 3L9.7 19.7C8.5 20.4 7 19.6 7 18.2Z"/>,
  replay: <><circle cx="12" cy="12" r="8" opacity=".13"/><path d="M5 9a7.5 7.5 0 1 1 .7 7M4.5 4.5V9h4.7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></>,
  clock: <><circle cx="12" cy="12" r="9" opacity=".18"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></>,
  alert: <><path d="M9.5 4.5a3 3 0 0 1 5 0l7 12a3 3 0 0 1-2.5 4.5H5a3 3 0 0 1-2.5-4.5Z" opacity=".2"/><path d="M12 8v6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><circle cx="12" cy="17.5" r="1.3"/></>,
  folder: <><path d="M3 7a3 3 0 0 1 3-3h4l3 3h5a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z" opacity=".2"/><path d="M3 10h18v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z" opacity=".65"/></>,
  signal: <><rect x="3" y="14" width="4" height="7" rx="2" opacity=".35"/><rect x="10" y="9" width="4" height="12" rx="2" opacity=".65"/><rect x="17" y="3" width="4" height="18" rx="2"/></>,
  sleep: <><path d="M19 16.5A9 9 0 0 1 7.5 5a8.5 8.5 0 1 0 11.5 11.5Z" opacity=".7"/><path d="M15 3v4M13 5h4M20 8v3M18.5 9.5h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></>,
  // Menu symbols share the navigation's rounded, two-tone silhouettes.
  monitor: <><rect x="2.5" y="3" width="19" height="14" rx="3.5" opacity=".24"/><rect x="7" y="6.5" width="10" height="7" rx="2" opacity=".6"/><path d="M10 17h4v3h-4Z"/><rect x="6" y="20" width="12" height="2.5" rx="1.25"/></>,
  software: <><rect x="2.5" y="2.5" width="19" height="19" rx="5" opacity=".24"/><path d="M2.5 8V7.5a5 5 0 0 1 5-5h9a5 5 0 0 1 5 5V8Z" opacity=".4"/><circle cx="6.5" cy="5.3" r="1"/><circle cx="10" cy="5.3" r="1"/><rect x="7" y="11" width="10" height="7" rx="2.5"/></>,
  gauge: <><circle cx="12" cy="12" r="9.5" opacity=".24"/><path d="M5.5 13a6.5 6.5 0 0 1 13 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity=".45"/><path d="m12 13 4-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/><circle cx="12" cy="13" r="2.4"/><rect x="7" y="18" width="10" height="2" rx="1" opacity=".6"/></>,
  bell: <><path d="M5 9a7 7 0 0 1 14 0v3.4l1.8 3a1.7 1.7 0 0 1-1.5 2.6H4.7a1.7 1.7 0 0 1-1.5-2.6l1.8-3Z" opacity=".24"/><path d="M8.5 9a3.5 3.5 0 0 1 7 0v3.5H8.5Z" opacity=".6"/><rect x="4" y="15" width="16" height="3" rx="1.5"/><path d="M9 20h6a3 3 0 0 1-6 0Z"/></>,
  info: <><circle cx="12" cy="12" r="10" opacity=".24"/><circle cx="12" cy="7" r="1.7"/><rect x="10.5" y="10.5" width="3" height="7.5" rx="1.5"/></>,
  leaf: <><path d="M20.8 3.3c.8 7.1-.6 13.2-6.8 15.4C8.6 20.7 3 17 3.4 12.2c.5-5.6 5.8-8.6 17.4-8.9Z" opacity=".3"/><path d="M4.5 20c2.8-5.2 6.1-8.7 11-11M8.5 14.7l.2-4.1M10.5 12.5l4.2.2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></>,
  sparkles: <><path d="M12 2.6c.3-.8 1.4-.8 1.7 0l2 5.3 5.3 2c.8.3.8 1.4 0 1.7l-5.3 2-2 5.3c-.3.8-1.4.8-1.7 0l-2-5.3-5.3-2c-.8-.3-.8-1.4 0-1.7l5.3-2Z"/><path d="M5 15.5 6.2 18.3 9 19.5l-2.8 1.2L5 23.5l-1.2-2.8L1 19.5l2.8-1.2Z" opacity=".3"/><circle cx="20.5" cy="3" r="1.5" opacity=".4"/></>,
  scan: <><rect x="4" y="4" width="16" height="16" rx="4" opacity=".18"/><path d="M8 3.5H6a2.5 2.5 0 0 0-2.5 2.5v2M16 3.5h2A2.5 2.5 0 0 1 20.5 6v2M3.5 16v2A2.5 2.5 0 0 0 6 20.5h2M20.5 16v2a2.5 2.5 0 0 1-2.5 2.5h-2M7 12h10" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></>,
  edit: <><path d="m4 15 11.5-11.5a3.2 3.2 0 0 1 4.5 4.5L8.5 19.5l-5 1Z" opacity=".25"/><path d="m8 15 9-9M4 20l4-1" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="m14.8 4.2 5 5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/></>,
  trash: <><path d="M5 7h14l-1 12a3 3 0 0 1-3 2.8H9a3 3 0 0 1-3-2.8Z" opacity=".25"/><rect x="3" y="4" width="18" height="3" rx="1.5"/><rect x="8" y="1.5" width="8" height="3" rx="1.5" opacity=".6"/><path d="M10 11v6M14 11v6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></>,
  verified: <><path d="m12 2.5 7.3 2.7a2 2 0 0 1 1.2 1.9v5.1c0 4.9-3.1 8-8.5 10.3-5.4-2.3-8.5-5.4-8.5-10.3V7.1a2 2 0 0 1 1.2-1.9Z" opacity=".24"/><path d="m8 12 2.7 2.7 5.3-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></>,
  help: <><circle cx="12" cy="12" r="10" opacity=".24"/><path d="M8.5 8.5a3.5 3.5 0 0 1 7 .5c0 2.5-3.5 2.5-3.5 4.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/><circle cx="12" cy="18" r="1.5"/></>,
  loader: <><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="3" opacity=".24"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></>,
  command: <><rect x="7.5" y="7.5" width="9" height="9" rx="2.5" opacity=".25"/><path d="M8 8V5.5A2.5 2.5 0 1 0 5.5 8H18.5A2.5 2.5 0 1 0 16 5.5v13a2.5 2.5 0 1 0 2.5-2.5h-13A2.5 2.5 0 1 0 8 18.5Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></>,
  flower: <><g opacity=".35"><ellipse cx="12" cy="6" rx="3" ry="4.5"/><ellipse cx="12" cy="18" rx="3" ry="4.5"/><ellipse cx="6.8" cy="9" rx="3" ry="4.5" transform="rotate(-60 6.8 9)"/><ellipse cx="17.2" cy="15" rx="3" ry="4.5" transform="rotate(-60 17.2 15)"/><ellipse cx="17.2" cy="9" rx="3" ry="4.5" transform="rotate(60 17.2 9)"/><ellipse cx="6.8" cy="15" rx="3" ry="4.5" transform="rotate(60 6.8 15)"/></g><circle cx="12" cy="12" r="4"/></>,
  code: <><rect x="2" y="4" width="20" height="16" rx="5" opacity=".2"/><path d="m8 8-4 4 4 4M16 8l4 4-4 4m-2-10-4 12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></>,
  diagonal: <><rect x="3" y="3" width="18" height="18" rx="5" opacity=".24"/><path d="m8 16 8-8M8 8h8v8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></>,
  pi: <><rect x="3" y="4" width="18" height="5" rx="2.5" opacity=".3"/><path d="M4 7h16M8.5 7v12M15.5 7v10a2 2 0 0 0 2 2" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></>,
  minus: null, maximize: <rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />,
  left: null, right: null, plus: null, close: null, up: null, down: null, check: null,
};
const strokes: Partial<Record<IconName, string>> = {
  left: 'm14.5 6.5-5.5 5.5 5.5 5.5', right: 'm9.5 6.5 5.5 5.5-5.5 5.5',
  minus: 'M5.5 12h13',
  plus: 'M12 5.5v13M5.5 12h13', close: 'm7 7 10 10M7 17 17 7',
  up: 'm7 14 5-5 5 5', down: 'm7 10 5 5 5-5', check: 'm5.5 12 4 4 9-10',
};
export function Icon({ name, size, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={`ui-icon icon-${name}${className ? ` ${className}` : ''}`} style={size ? { '--menu-icon-size': `${size}px` } as CSSProperties : undefined} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{strokes[name] ? <path d={strokes[name]} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/> : glyphs[name]}</svg>;
}
