import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
/** Read only generated protocol definitions, never arbitrary $ref paths. */
export function readOnlyMode(documents) {
  const locate = name => documents.flatMap(doc => [doc.title === name ? doc : undefined, doc.definitions?.[name], doc.$defs?.[name]]).find(object);
  const root = locate('ThreadStartParams');
  if (!root || !object(root.properties) || !object(root.properties.sandbox)) return;
  const values = new Set();
  const visit = (node, depth) => {
    if (!object(node) || depth > 16) return;
    if (Array.isArray(node.enum)) for (const value of node.enum) values.add(value);
    for (const key of ['anyOf', 'oneOf', 'allOf']) if (Array.isArray(node[key])) for (const item of node[key]) visit(item, depth + 1);
    if (typeof node.$ref === 'string') {
      const match = /^(?:#\/(?:definitions|\$defs)\/)?(SandboxMode)(?:\.json)?$/.exec(node.$ref);
      if (match) visit(locate(match[1]), depth + 1);
    }
  };
  visit(root.properties.sandbox, 0);
  return values.has('read-only') ? 'read-only' : values.has('readOnly') ? 'readOnly' : undefined;
}
export async function readGeneratedMode(root) {
  const documents = [];
  for (const name of ['v2/ThreadStartParams.json', 'ThreadStartParams.json', 'SandboxMode.json', 'v2/SandboxMode.json', 'codex_app_server_protocol.schemas.json']) {
    const file = join(root, name);
    if (name.startsWith('v2/')) {
      try { const parent = await lstat(join(root, 'v2')); if (!parent.isDirectory()) throw new Error('Unsafe schema directory'); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    }
    let stat;
    try { stat = await lstat(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('Unsupported generated schema');
    const doc = JSON.parse(await readFile(file, 'utf8'));
    if (object(doc)) documents.push(doc);
  }
  return readOnlyMode(documents);
}
