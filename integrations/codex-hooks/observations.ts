import { randomUUID } from 'node:crypto';
import type { CompanionFacts, ObservationCapabilities, SessionObservation } from '../../packages/domain/src/index.js';
import type { CodexHookFact } from './normalize.js';
export const CODEX_FEEDBACK_MS = 2000;
type Session = {
  id: string; revision: number; connected: boolean; ended: boolean; saturated: boolean;
  turn?: string; work?: string; interrupted: boolean; turns: Set<string>; tools: Set<string>;
  capabilities: ObservationCapabilities; feedback?: CompanionFacts; timer?: ReturnType<typeof setTimeout>;
};
type Run = { retired: boolean; sessions: Map<string, Session> };
/** Main-private adapter, called only after independent run binding. No Agent control.
 * Multiple sessions in one host remain independent. Native IDs never enter shared state.
 * Submission, approval and Stop are not proof of execution, waiting or successful completion.
 */
export function createCodexObservations(options: {
  publish(observation: SessionObservation): void; name(): string; now?: () => Date;
}) {
  const runs = new Map<string, Run>();
  let closed = false;
  const clear = (session: Session) => {
    clearTimeout(session.timer); delete session.timer; delete session.feedback;
  };
  const emit = (runId: string, session: Session) => {
    try {
      const observation: SessionObservation = {
        provider: 'codex', sessionId: session.id, providerSessionId: session.id, processInstanceId: runId,
        agentName: options.name(), status: 'unknown', connected: session.connected,
        observedAt: (options.now?.() ?? new Date()).toISOString(), revision: ++session.revision,
        ...(session.work ? { workId: session.work } : {}), capabilities: { ...session.capabilities },
        facts: session.feedback ?? { activities: [], waitingForInput: false },
      };
      // A broken consumer cannot interrupt timer/session cleanup or affect the observed Agent.
      const result: unknown = options.publish(observation); void Promise.resolve(result).catch(() => {});
    } catch { /* Observation publishing is best effort; never control the Agent on consumer failure. */ }
  };
  const feedback = (runId: string, session: Session, facts: CompanionFacts) => {
    clear(session); session.feedback = facts;
    // Install before publishing: a synchronous subscriber may stop or retire us.
    session.timer = setTimeout(() => {
      if (closed || !session.connected || session.ended) return;
      clear(session); emit(runId, session);
    }, CODEX_FEEDBACK_MS);
    session.timer.unref?.(); emit(runId, session);
  };
  const disconnect = (runId: string, session: Session) => {
    clear(session); session.connected = false; session.ended = true; emit(runId, session);
  };
  return {
    accept({ runId, fact }: { runId: string; fact: CodexHookFact }): void {
      if (closed || fact.childId) return;
      let run = runs.get(runId);
      if (run?.retired) return;
      if (fact.kind === 'session-started') {
        if (run?.sessions.has(fact.providerSessionId)) return;
        if ((!run && runs.size >= 32) || (run && run.sessions.size >= 32)) return;
        const session: Session = { id: randomUUID(), revision: 0, connected: true, ended: false,
          saturated: false, interrupted: false, turns: new Set(), tools: new Set(), capabilities: {} };
        if (!run) { run = { retired: false, sessions: new Map() }; runs.set(runId, run); }
        run.sessions.set(fact.providerSessionId, session); emit(runId, session); return;
      }
      const session = run?.sessions.get(fact.providerSessionId);
      if (!session || session.ended) return;
      if (fact.kind === 'session-ended') { disconnect(runId, session); return; }
      if (session.saturated) return;
      if (fact.kind === 'turn-submitted') {
        if (session.turns.has(fact.turnId)) return;
        if (session.turns.size >= 256) { session.saturated = true; clear(session); emit(runId, session); return; }
        clear(session); session.turns.add(fact.turnId); session.turn = fact.turnId;
        session.work = randomUUID(); session.interrupted = false; emit(runId, session); return;
      }
      if (!fact.turnId || fact.turnId !== session.turn || session.interrupted) return;
      if (fact.kind === 'turn-interrupted') {
        session.interrupted = true; session.capabilities.cancelled = 'supported';
        feedback(runId, session, { activities: [], waitingForInput: false,
          occurrence: { id: randomUUID(), kind: 'cancelled' } }); return;
      }
      if (fact.kind === 'tool-returned') {
        if (session.tools.has(fact.toolCallId)) return;
        if (session.tools.size >= 1024) { session.saturated = true; clear(session); emit(runId, session); return; }
        session.tools.add(fact.toolCallId);
        if (fact.activity === 'other') return;
        session.capabilities[fact.activity] = 'supported';
        feedback(runId, session, { activities: [], waitingForInput: false,
          recentActivity: { id: randomUUID(), kind: fact.activity } });
      } else if (fact.kind === 'compact-finished') {
        // No native compaction occurrence ID: avoid replayable visual effects for this event.
        clear(session); emit(runId, session);
      } else if (fact.kind === 'stop-requested') {
        clear(session); emit(runId, session);
      }
    },
    retire(runId: string): void {
      const run = runs.get(runId);
      if (!run) {
        if (runs.size < 32) runs.set(runId, { retired: true, sessions: new Map() });
        return;
      }
      if (run.retired) return;
      run.retired = true;
      for (const session of run.sessions.values()) if (session.connected) disconnect(runId, session);
      // Keep bounded tombstones; never re-admit an old run with replayed startup.
    },
    stop(): void {
      if (closed) return; closed = true;
      for (const [runId, run] of runs) {
        run.retired = true;
        for (const session of run.sessions.values()) if (session.connected) disconnect(runId, session);
      }
      runs.clear();
    },
  };
}
