// Explicit operator entry. Never discovers targets, starts pi or prints credentials.
import { parseArgs } from 'node:util';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const { values } = parseArgs({ options: {
  'connection-directory': { type: 'string' }, 'expected-target': { type: 'string' }, operation: { type: 'string' }, mode: { type: 'string', default: 'preview' },
} });
let vite;
try {
  if (!values['connection-directory'] || !values['expected-target'] || !values.operation || !['preview', 'apply', 'restore'].includes(values.mode)) throw Error();
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
  const { PiExtensionUpdate } = await vite.ssrLoadModule('/apps/desktop/src/main/pi-extension-update.ts');
  const updater = new PiExtensionUpdate(values['connection-directory'], values.operation, values['expected-target']);
  const preview = values.mode === 'restore' ? undefined : await updater.preview();
  const result = values.mode === 'preview' ? preview : values.mode === 'apply' ? await updater.apply(preview) : await updater.restore();
  console.log(JSON.stringify(result));
  if (result.status && !['updated', 'restored'].includes(result.status)) process.exitCode = 1;
} catch { console.error('Pi extension operation refused; no automatic repair.'); process.exitCode = 1; }
finally { await vite?.close(); }
