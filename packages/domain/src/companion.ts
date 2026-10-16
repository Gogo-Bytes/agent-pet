/** Provider-neutral observations: no animation names, prompts, tool arguments or output. */
export const activityKinds = ['thinking', 'responding', 'reading', 'writing', 'searching', 'executing', 'compacting', 'retrying'] as const;
export type ActivityKind = typeof activityKinds[number];
export const occurrenceKinds = ['tool_error', 'output_limited', 'cancelled'] as const;
export type OccurrenceKind = typeof occurrenceKinds[number];
export type ObservationSupport = 'supported' | 'unsupported' | 'unknown';
export type ObservationCapabilities = Partial<Record<ActivityKind | OccurrenceKind | 'waiting_input', ObservationSupport>>;
export type CompanionFacts = {
  activities: readonly ActivityKind[];
  waitingForInput: boolean;
  occurrence?: { id: string; kind: OccurrenceKind };
};
