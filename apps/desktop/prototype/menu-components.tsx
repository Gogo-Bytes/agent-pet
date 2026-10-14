// Opaque, flat menu artwork scoped to the connection and preference prototypes.
import { Icon, type IconName } from './components/icons.js';
import type { KeyboardEvent } from 'react';
import type { AgentEntry } from './connection-options.js';
const glyphs: Record<string, IconName> = {pi:'pi',Codex:'command','Claude Code':'flower','Gemini CLI':'sparkles',OpenCode:'code',Cursor:'diagonal'};
export function AgentMark({agent}:{agent:AgentEntry}) {
 const glyph=glyphs[agent.name]??'software';
 return <span className={`menu-agent-mark agent-${agent.id.split('-')[0]}`} aria-hidden="true"><Icon name={glyph}/></span>;
}

export function trapMenuFocus(event:KeyboardEvent<HTMLDialogElement>) {
 if(event.key!=='Tab')return;
 const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')).filter(element=>element.getClientRects().length>0&&element.tabIndex>=0);
 const first=controls[0],last=controls.at(-1);if(!first||!last)return;
 if(event.shiftKey&&(document.activeElement===first||!controls.includes(document.activeElement as HTMLElement))){event.preventDefault();last.focus({preventScroll:true});}
 else if(!event.shiftKey&&(document.activeElement===last||!controls.includes(document.activeElement as HTMLElement))){event.preventDefault();first.focus({preventScroll:true});}
}
