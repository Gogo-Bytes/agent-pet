import { randomUUID } from 'node:crypto';
import type { ActivityKind, CompanionFacts, ObservationCapabilities, SessionObservation } from '../../packages/domain/src/index.js';
import type { ClaudeHookFact } from './normalize.js';

type Session = {
  nativeId: string; id: string; revision: number; connected: boolean;
  prompt?: string; work?: string; failed: boolean; ended: boolean; saturated: boolean;
  prompts: Set<string>; tools: Set<string>; capabilities: ObservationCapabilities;
  feedback?: CompanionFacts; timer?: ReturnType<typeof setTimeout>;
};
type Run = { sessions: Map<string, Session>; current: Session };
export const CLAUDE_FEEDBACK_MS = 2000;

/** Main-private correlation. Native identities never become Application/Renderer IDs.
 * Pre-hooks and Stop are deliberately not execution/completion signals: other hooks
 * can still block or continue them. Tool results produce only short recent feedback.
 */
export function createClaudeObservations(options: {
  publish(observation: SessionObservation): void;
  name(): string;
  now?: () => Date;
}) {
  const runs = new Map<string, Run>();
  let closed = false;
  const clear = (session: Session) => {
    clearTimeout(session.timer); delete session.timer; delete session.feedback;
  };
  const emit = (runId: string, session: Session) => {
    options.publish({ sessionId: session.id, provider: 'claude', processInstanceId: runId,
      providerSessionId: session.id, status: session.failed ? 'error' : 'unknown', connected: session.connected,
      agentName: options.name(), observedAt: (options.now?.() ?? new Date()).toISOString(), revision: ++session.revision,
      ...(session.work ? { workId: session.work } : {}), capabilities: { ...session.capabilities },
      facts: session.feedback ?? { activities: [], waitingForInput: false } });
  };
  const retireSession = (runId: string, session: Session) => {
    clear(session); session.connected = false; emit(runId, session);
  };
  const feedback = (runId: string, session: Session, facts: CompanionFacts) => {
    clear(session); session.feedback = facts; emit(runId, session);
    session.timer = setTimeout(() => {
      if (closed || runs.get(runId)?.current !== session || !session.connected) return;
      clear(session); emit(runId, session);
    }, CLAUDE_FEEDBACK_MS);
    session.timer.unref?.();
  };
  return {
    accept({ runId, fact }: { runId: string; fact: ClaudeHookFact }): void {
      if (closed || fact.childId) return;
      let run = runs.get(runId);
      if (fact.kind === 'session-started') {
        if (run?.sessions.has(fact.providerSessionId)) return;
        if (!run && runs.size >= 32) return;
        if (run && run.sessions.size >= 32) return;
        if (run) retireSession(runId, run.current);
        const session: Session = { nativeId: fact.providerSessionId, id: randomUUID(), revision: 0,
          connected: true, failed: false, ended: false, saturated: false, prompts: new Set(), tools: new Set(), capabilities: {} };
        if (run) { run.sessions.set(session.nativeId, session); run.current = session; }
        else { run = { sessions: new Map([[session.nativeId, session]]), current: session }; runs.set(runId, run); }
        emit(runId, session); return;
      }
      const session = run?.current;
      if (!run || !session || session.nativeId !== fact.providerSessionId || session.ended || session.saturated) return;
      if (fact.kind === 'session-ended') {
        clear(session); session.ended = true; emit(runId, session); return;
      }
      if (fact.kind === 'turn-submitted') {
        if (!fact.promptId || session.prompts.has(fact.promptId)) return;
        if (session.prompts.size >= 256) { session.saturated = true; clear(session); emit(runId, session); return; }
        clear(session); session.prompts.add(fact.promptId); session.prompt = fact.promptId;
        session.work = randomUUID(); session.failed = false; emit(runId, session); return;
      }
      // Missing prompt IDs on older Claude versions remain presence-only. Never attach
      // an uncorrelated result to whichever user prompt happened to arrive most recently.
      if (!fact.promptId || fact.promptId !== session.prompt) return;
      if (fact.kind === 'tool-succeeded' || fact.kind === 'tool-failed') {
        if (session.failed) return;
        if (session.tools.has(fact.toolCallId)) return;
        if (session.tools.size >= 1024) { session.saturated = true; clear(session); emit(runId, session); return; }
        session.tools.add(fact.toolCallId);
        if (fact.kind === 'tool-failed') {
          // A tool interruption is neither a tool error nor a cancelled user task.
          if (fact.interrupted !== false) return;
          session.capabilities.tool_error = 'supported';
          feedback(runId, session, { activities: [], waitingForInput: false, occurrence: { id: randomUUID(), kind: 'tool_error' } });
        } else if (fact.activity !== 'other') {
          const kind: ActivityKind = fact.activity; session.capabilities[kind] = 'supported';
          feedback(runId, session, { activities: [], waitingForInput: false, recentActivity: { id: randomUUID(), kind } });
        }
      } else if (fact.kind === 'turn-failed' && !session.failed) {
        clear(session); session.failed = true; emit(runId, session);
      } else if (fact.kind === 'response-stopped') {
        clear(session); emit(runId, session);
      }
      // approval-check/permission-prompt do not supply a reliable paired clear;
      // compact-started and tool-requested are blockable precursors, not activity.
    },
    retire(runId: string): void {
      const run = runs.get(runId); if (!run) return;
      runs.delete(runId);
      for (const session of run.sessions.values()) if (session.connected) retireSession(runId, session);
    },
    stop(): void {
      if (closed) return; closed = true;
      for (const [runId, run] of runs) for (const session of run.sessions.values()) if (session.connected) retireSession(runId, session);
      runs.clear();
    },
  };
}
