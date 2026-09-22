import { createSessionId } from '@agent-pet/adapter-core';
import type { SessionObservation } from '@agent-pet/domain';
import type { PiSessionMessage } from './protocol.js';

export type SessionMapperOptions = {
  publish(observation: SessionObservation): void;
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
    status: SessionObservation['status'];
    workId?: string;
  };
  constructor(private readonly options: SessionMapperOptions) {}
  handle(message: PiSessionMessage): void {
    if (message.seq <= this.lastSeq) return;
    this.lastSeq = message.seq;
    if (message.type === 'hello') {
      this.context = {
        processInstanceId: message.processInstanceId,
        providerSessionId: message.providerSessionId,
        ...(message.sessionName !== undefined ? { sessionName: message.sessionName } : {}),
        ...(message.projectName !== undefined ? { projectName: message.projectName } : {}),
        status: message.status,
        ...(message.workId !== undefined ? { workId: message.workId } : {}),
      };
      this.connected = true;
      this.options.connectionChanged?.('connected');
      this.publish(message.status, message.sentAt, message.workId);
      return;
    }
    if (!this.context) return;
    if (message.processInstanceId !== this.context.processInstanceId || message.providerSessionId !== this.context.providerSessionId) return;
    if (message.type === 'session_info_changed') {
      const { sessionName: _previousName, ...context } = this.context;
      this.context = { ...context, ...(message.sessionName !== undefined ? { sessionName: message.sessionName } : {}) };
      this.publish(this.context.status, message.sentAt, this.context.workId);
    } else if (message.type === 'lifecycle') {
      const { workId: _previousWork, ...context } = this.context;
      this.context = { ...context, status: message.status, ...(message.workId !== undefined ? { workId: message.workId } : {}) };
      this.publish(message.status, message.sentAt, message.workId);
    }
  }
  disconnected(): void {
    if (!this.connected) return;
    this.connected = false;
    this.options.connectionChanged?.('disconnected');
  }
  private publish(status: SessionObservation['status'], sentAt: string, workId?: string): void {
    if (!this.context) return;
    const legacyId = createSessionId({ provider: 'pi', processInstanceId: this.context.processInstanceId, providerSessionId: this.context.providerSessionId });
    this.options.publish({
      sessionId: this.options.namespace ? `${this.options.namespace}:${legacyId}` : legacyId,
      provider: 'pi', status, observedAt: sentAt,
      ...(this.context.sessionName !== undefined ? { agentName: this.context.sessionName } : {}),
      ...(this.context.projectName !== undefined ? { projectName: this.context.projectName } : {}),
      ...(workId !== undefined ? { workId } : {}),
      revision: this.lastSeq,
      providerSessionId: this.context.providerSessionId,
      processInstanceId: this.context.processInstanceId,
    });
  }
}
