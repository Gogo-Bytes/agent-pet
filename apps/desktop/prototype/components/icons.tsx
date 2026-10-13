import type { ReactNode } from 'react';

export type IconName = 'home' | 'pet' | 'link' | 'settings' | 'grid' | 'left' | 'right' | 'plus' | 'close' | 'search' | 'play' | 'replay' | 'up' | 'down' | 'check' | 'clock' | 'alert' | 'folder' | 'signal' | 'sleep';

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
  left: null, right: null, plus: null, close: null, up: null, down: null, check: null,
};
const strokes: Partial<Record<IconName, string>> = {
  left: 'm14.5 6.5-5.5 5.5 5.5 5.5', right: 'm9.5 6.5 5.5 5.5-5.5 5.5',
  plus: 'M12 5.5v13M5.5 12h13', close: 'm7 7 10 10M7 17 17 7',
  up: 'm7 14 5-5 5 5', down: 'm7 10 5 5 5-5', check: 'm5.5 12 4 4 9-10',
};
export function Icon({ name }: { name: IconName }) {
  return <svg className={`ui-icon icon-${name}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{strokes[name] ? <path d={strokes[name]} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/> : glyphs[name]}</svg>;
}
