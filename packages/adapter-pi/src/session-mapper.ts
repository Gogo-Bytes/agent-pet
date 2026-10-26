import { createSessionId } from '@agent-pet/adapter-core';
import type { SessionObservation, CompanionFacts, ObservationCapabilities } from '@agent-pet/domain';
import type { PiSessionMessage } from './protocol.js';

export type SessionMapperOptions = {
  publish(observation: SessionObservation): void;
  publishDisconnected?(observation: SessionObservation): void;
  connectionChanged?(state: 'connected' | 'degraded' | 'disconnected'): void;
  /** Server-bound managed namespace; legacy callers omit it. */
  namespace?: string;
};

/** Maps validated observations only; contains no credential or authentication logic. */
export class PiSessionMapper {
  private connected = false;
  private lastSeq = 0;
  private context?: {
    processInstanceId: string;
    providerSessionId: string;
    sessionName?: string;
    projectName?: string;
    baseline: boolean;
    status: SessionObservation['status'];
    workId?: string;
    facts?: CompanionFacts;
    capabilities?: ObservationCapabilities;
  };
  constructor(private readonly options: SessionMapperOptions) {}
  handle(message: PiSessionMessage): void {
    if (message.seq <= this.lastSeq) return;
    this.lastSeq = message.seq;
    if (message.type === 'hello') {
      if (this.connected && this.context && this.options.publishDisconnected &&
          (message.processInstanceId !== this.context.processInstanceId || message.providerSessionId !== this.context.providerSessionId)) {
        this.publish(this.context.status, message.sentAt, this.context.workId, false, false);
        if (!this.connected) return; // A cleanup observer may stop the receiver.
      }
      this.context = {
        processInstanceId: message.processInstanceId,
        providerSessionId: message.providerSessionId,
        ...(message.sessionName !== undefined ? { sessionName: message.sessionName } : {}),
        ...(message.projectName !== undefined ? { projectName: message.projectName } : {}),
        status: message.status, baseline: true,
        ...(message.facts ? { facts: { activities: message.facts.activities, waitingForInput: message.facts.waitingForInput } } : {}),
        ...(message.capabilities ? { capabilities: message.capabilities } : {}),
        ...(message.workId !== undefined ? { workId: message.workId } : {}),
      };
      this.connected = true;
      this.options.connectionChanged?.('connected');
      if (this.connected) this.publish(message.status, message.sentAt, message.workId, true);
      return;
    }
    if (!this.context || !this.connected) return;
    if (message.processInstanceId !== this.context.processInstanceId || message.providerSessionId !== this.context.providerSessionId) return;
    if (message.type === 'session_info_changed') {
      const { sessionName: _previousName, ...context } = this.context;
      this.context = { ...context, ...(message.sessionName !== undefined ? { sessionName: message.sessionName } : {}) };
      this.publish(this.context.status, message.sentAt, this.context.workId);
    } else if (message.type === 'lifecycle') {
      const { workId: _previousWork, ...context } = this.context;
      this.context = { ...context, facts: message.facts ?? { activities: [], waitingForInput: false }, baseline: false, ...(message.capabilities ? { capabilities: message.capabilities } : {}), status: message.status, ...(message.workId !== undefined ? { workId: message.workId } : {}) };
      this.publish(message.status, message.sentAt, message.workId);
    } else if (message.type === 'companion' && this.connected) {
      this.context = { ...this.context, facts: message.facts, ...(message.capabilities ? { capabilities: message.capabilities } : {}) };
      this.publish(this.context.status, message.sentAt, this.context.workId);
    }
  }
  disconnected(): void {
    if (!this.connected) return;
    this.connected = false;
    this.options.connectionChanged?.('disconnected');
    if (this.options.publishDisconnected) this.publish(this.context!.status, new Date().toISOString(), this.context!.workId);
  }
  private publish(status: SessionObservation['status'], sentAt: string, workId?: string, baseline = false, connected = this.connected): void {
    if (!this.context) return;
    const legacyId = createSessionId({ provider: 'pi', processInstanceId: this.context.processInstanceId, providerSessionId: this.context.providerSessionId });
    const publish = !connected && this.options.publishDisconnected ? this.options.publishDisconnected : this.options.publish;
    publish({
      sessionId: this.options.namespace ? `${this.options.namespace}:${legacyId}` : legacyId,
      provider: 'pi', status, observedAt: sentAt,
      ...(this.context.sessionName !== undefined ? { agentName: this.context.sessionName } : {}),
      ...(this.context.projectName !== undefined ? { projectName: this.context.projectName } : {}),
      ...(workId !== undefined ? { workId } : {}),
      // Even slots are wire observations; the following odd slot clears transport
      // activity on loss. A newer hello always supersedes an old peer's close.
      revision: this.options.publishDisconnected ? this.lastSeq * 2 + (connected ? 0 : 1) : this.lastSeq,
      connected,
      ...(baseline || this.context.baseline ? { baseline: true } : {}),
      ...(this.context.capabilities ? { capabilities: this.context.capabilities } : {}),
      facts: connected ? (this.context.facts ?? { activities: [], waitingForInput: false }) : { activities: [], waitingForInput: false },
      providerSessionId: this.context.providerSessionId,
      processInstanceId: this.context.processInstanceId,
    });
  }
}
