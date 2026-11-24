import { randomUUID } from 'node:crypto';
import type { SessionObservation } from '../../packages/domain/src/index.js';
import type { ClaudeHookFact } from './normalize.js';

type Session = {
  nativeId: string; id: string; revision: number; connected: boolean;
  prompt?: string; observedPrompt?: string; work?: string; failed: boolean; ended: boolean; saturated: boolean;
  prompts: Set<string>; tools: Set<string>;
};
// Only post-execution facts may replace the published work identity.
function confirmWork(session: Session, promptId: string): boolean {
  if (session.observedPrompt === promptId) return false;
  session.observedPrompt = promptId; session.work = randomUUID(); session.failed = false;
  return true;
}
type Run = { sessions: Map<string, Session>; current: Session };

/** Main-private correlation. Native identities never become Application/Renderer IDs.
 * Pre-hooks and Stop are deliberately not execution/completion signals: other hooks
 * can still block or continue them. Tool results can confirm a new prompt ran.
 */
export function createClaudeObservations(options: {
  publish(observation: SessionObservation): void;
  name(): string;
  now?: () => Date;
}) {
  const runs = new Map<string, Run>();
  let closed = false;
  const emit = (runId: string, session: Session) => {
    try {
      const observation: SessionObservation = { sessionId: session.id, provider: 'claude', processInstanceId: runId,
        providerSessionId: session.id, status: session.failed ? 'error' : 'unknown', connected: session.connected,
        agentName: options.name(), observedAt: (options.now?.() ?? new Date()).toISOString(), revision: ++session.revision,
        ...(session.work ? { workId: session.work } : {}), capabilities: {},
        facts: { activities: [], waitingForInput: false } };
      const result: unknown = options.publish(observation); void Promise.resolve(result).catch(() => {});
    } catch { /* Consumer failure must not interrupt session cleanup or affect the Agent. */ }
  };
  const retireSession = (runId: string, session: Session) => {
    session.connected = false; emit(runId, session);
  };
  return {
    accept({ runId, fact }: { runId: string; fact: ClaudeHookFact }): void {
      if (closed || fact.childId) return;
      let run = runs.get(runId);
      if (fact.kind === 'session-started') {
        if (run?.sessions.has(fact.providerSessionId)) return;
        if (!run && runs.size >= 32) return;
        if (run && run.sessions.size >= 32) return;
        if (run) {
          const previous = run.current;
          if (previous.connected) retireSession(runId, previous);
          if (closed || runs.get(runId) !== run || run.current !== previous) return;
        }
        const session: Session = { nativeId: fact.providerSessionId, id: randomUUID(), revision: 0,
          connected: true, failed: false, ended: false, saturated: false, prompts: new Set(), tools: new Set() };
        if (run) { run.sessions.set(session.nativeId, session); run.current = session; }
        else { run = { sessions: new Map([[session.nativeId, session]]), current: session }; runs.set(runId, run); }
        emit(runId, session); return;
      }
      const session = run?.current;
      if (!run || !session || session.nativeId !== fact.providerSessionId || session.ended || session.saturated) return;
      if (fact.kind === 'session-ended') {
        session.ended = true; emit(runId, session); return;
      }
      if (fact.kind === 'turn-submitted') {
        if (!fact.promptId || session.prompts.has(fact.promptId)) return;
        if (session.prompts.size >= 256) { session.saturated = true; return; }
        session.prompts.add(fact.promptId); session.prompt = fact.promptId;
        return;
      }
      // Missing prompt IDs on older Claude versions remain presence-only. Never attach
      // an uncorrelated result to whichever user prompt happened to arrive most recently.
      if (!fact.promptId || fact.promptId !== session.prompt) return;
      if (fact.kind === 'tool-succeeded' || fact.kind === 'tool-failed') {
        if (session.failed && session.observedPrompt === fact.promptId) return;
        if (session.tools.has(fact.toolCallId)) return;
        if (session.tools.size >= 1024) { session.saturated = true; return; }
        session.tools.add(fact.toolCallId);
        // Older observers still send tool categories. None is a pet action or a turn outcome.
        if (confirmWork(session, fact.promptId)) emit(runId, session);
      } else if (fact.kind === 'turn-failed') {
        confirmWork(session, fact.promptId);
        if (session.failed) return;
        session.failed = true; emit(runId, session);
      } else if (fact.kind === 'response-stopped') {
        // Claude responded; another hook may continue it, so the outcome stays unknown.
        if (confirmWork(session, fact.promptId)) emit(runId, session);
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
