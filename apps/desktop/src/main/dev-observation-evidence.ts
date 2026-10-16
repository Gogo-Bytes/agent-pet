import * as fs from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { activityKinds, occurrenceKinds, type SessionState } from '@agent-pet/domain';
import { projectPetPresentation } from '@agent-pet/pet-runtime';

const MAX_BYTES = 128 * 1024;
/** Opt-in dev-only evidence. Receives snapshots, projects an enum allowlist, never serializes input. */
export function createDevObservationEvidence(directory: string) {
  let descriptor: number | undefined, identity: fs.Stats | undefined, size = 0, last = '';
  let status: 'recording' | 'closed' | 'failed-preserved' | 'limit-reached' = 'recording';
  const salt = randomBytes(32);
  const path = join(directory, 'states.ndjson');
  function close(next: typeof status = 'closed') {
    status = next;
    if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch { status = 'failed-preserved'; } descriptor = undefined; }
  }
  try {
    if (!isAbsolute(directory) || normalize(directory) !== directory || Buffer.byteLength(directory) > 4096) throw Error();
    let current = '/';
    for (const part of directory.split('/').filter(Boolean)) {
      current = join(current, part); const stat = fs.lstatSync(current);
      const sticky = current !== directory && stat.uid === 0 && !!(stat.mode & 0o1000);
      if (!stat.isDirectory() || stat.isSymbolicLink() || ((stat.mode & 0o022) && !sticky)) throw Error();
    }
    const stat = fs.lstatSync(directory);
    if (stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o700 || dirname(directory) === directory) throw Error();
    descriptor = fs.openSync(path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    identity = fs.fstatSync(descriptor);
  } catch { close('failed-preserved'); }
  return {
    status: () => status,
    close: () => close(),
    observe(snapshot: SessionState) {
      if (descriptor === undefined || !identity) return;
      try {
        const now = fs.lstatSync(path);
        if (now.dev !== identity.dev || now.ino !== identity.ino || now.nlink !== 1 || (now.mode & 0o7777) !== 0o600 || now.uid !== process.getuid?.()) throw Error();
        const states = Object.values(snapshot.sessions).slice(0, 128).map(record => {
          const activities = activityKinds.filter(kind => record.facts?.activities.includes(kind));
          const capabilities = Object.fromEntries([...activityKinds, ...occurrenceKinds, 'waiting_input' as const].map(kind =>
            [kind, ['supported', 'unsupported'].includes(record.capabilities?.[kind] ?? '') ? record.capabilities![kind] : 'unknown']));
          const occurrence = record.facts?.occurrence?.kind;
          return { session: createHmac('sha256', salt).update(record.sessionId).digest('hex').slice(0, 12),
            status: ['working', 'completed', 'error', 'idle', 'waiting_input', 'offline'].includes(record.status) ? record.status : 'unknown',
            connected: typeof record.connected === 'boolean' ? record.connected : null, activities, waiting: record.facts?.waitingForInput === true,
            ...(occurrence && (occurrenceKinds as readonly string[]).includes(occurrence) ? { occurrence } : {}), capabilities,
            requestedAction: projectPetPresentation({ sessions: { [record.sessionId]: record }, bubbles: snapshot.bubbles.filter(bubble => bubble.sessionId === record.sessionId) }).action };
        });
        const encoded = JSON.stringify({ states, truncated: Object.keys(snapshot.sessions).length > 128 });
        if (encoded === last) return;
        const line = JSON.stringify({ at: new Date().toISOString(), ...JSON.parse(encoded) }) + '\n';
        const bytes = Buffer.byteLength(line);
        if (size + bytes > MAX_BYTES) { close('limit-reached'); return; }
        fs.writeFileSync(descriptor, line); size += bytes; last = encoded;
      } catch { close('failed-preserved'); }
    },
  };
}
