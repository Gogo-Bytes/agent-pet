// P0 discovery only: invoke installed package manager; never import fixture modules.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import cp from 'node:child_process';
const root = process.cwd();
const pkg = process.env.PI_PACKAGE_DIR;
assert(/^\/(?:private\/)?tmp\/ap-pi-discovery\.[^/]+$/.test(root));
assert.equal(process.env.HOME, join(root, 'home'));
assert.equal(homedir(), process.env.HOME);
assert.equal(process.permission.has('child'), false);
assert.equal(process.permission.has('worker'), false);
assert.equal(process.permission.has('fs.read', '/Users/gan/.pi/agent/settings.json'), false);
assert.equal(process.permission.has('fs.write', pkg), false);
const blocked = [];
const deny = name => (...args) => { blocked.push(name); throw new Error(`Forbidden side effect: ${name}`); };
for (const [mod, names] of [[net,['connect','createConnection','createServer']], [tls,['connect','createServer']], [http,['request','get','createServer']], [https,['request','get','createServer']], [dgram,['createSocket']], [cp,['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']]]) {
  for (const name of names) mod[name] = deny(name);
}
net.Socket.prototype.connect = deny('Socket.connect');
globalThis.fetch = deny('fetch');
syncBuiltinESMExports();
const { DefaultPackageManager } = await import(pathToFileURL(join(pkg, 'dist/core/package-manager.js')));
const identity = JSON.parse(fs.readFileSync(join(pkg, 'package.json'), 'utf8'));
assert.equal(identity.version, '0.85.1');
const fixture = 'throw new Error("P0_FIXTURE_MUST_NOT_EXECUTE");\nexport default function () { throw new Error("P0_FACTORY_MUST_NOT_EXECUTE"); }\n';
function put(path, content = fixture) { fs.mkdirSync(resolve(path, '..'), {recursive:true}); fs.writeFileSync(path, content); }
const cases = [
  {id:'standalone', files:['agent-pet.ts'], expected:[['agent-pet.ts',true]]},
  {id:'root-index', files:['agent-pet.ts','index.ts'], expected:[['index.ts',true]]},
  {id:'root-manifest', files:['agent-pet.ts','entry.js'], manifest:{pi:{extensions:['entry.js']}}, expected:[['entry.js',true]]},
  ...['.gitignore','.ignore','.fdignore'].map(ignore => ({id:`ignore-${ignore.slice(1)}`,files:['agent-pet.ts'],ignore, expected:[]})),
  {id:'glob-exclusion', files:['agent-pet.ts'], overrides:['!extensions/*.ts'], expected:[['agent-pet.ts',false]]},
  {id:'exact-exclusion', files:['agent-pet.ts'], overrides:['-extensions/agent-pet.ts'], expected:[['agent-pet.ts',false]]},
  {id:'non-js-backups', files:['agent-pet.ts','agent-pet.ts.tmp','agent-pet.ts.bak','agent-pet.js~','.agent-pet.ts'], expected:[['agent-pet.ts',true]]},
  {id:'duplicate-files', files:['agent-pet.ts','agent-pet-old.ts'], expected:[['agent-pet-old.ts',true],['agent-pet.ts',true]]},
  {id:'custom-agent-dir', files:['agent-pet.ts'], custom:true, expected:[['agent-pet.ts',true]]},
];
const results = [];
for (const c of cases) {
  const base = join(root, 'cases', c.id);
  const cwd = join(base, 'project');
  const agentDir = join(base, c.custom ? 'chosen-profile' : 'agent');
  const ext = join(agentDir,'extensions');
  fs.mkdirSync(cwd, {recursive:true});
  for (const name of c.files) put(join(ext,name));
  if (c.manifest) put(join(ext,'package.json'), JSON.stringify(c.manifest));
  if (c.ignore) put(join(ext,c.ignore), 'agent-pet.ts\n');
  // Neither project resources nor synthetic default-agent resources should leak into results.
  put(join(cwd,'.pi/extensions/project-decoy.ts'));
  if (c.custom) put(join(process.env.HOME,'.pi/agent/extensions/default-decoy.ts'));
  const globalSettings = Object.freeze({packages:[], extensions:c.overrides ?? []});
  const projectSettings = Object.freeze({packages:[]});
  const settingsManager = { getGlobalSettings:()=>globalSettings, getProjectSettings:()=>projectSettings, isProjectTrusted:()=>false };
  const manager = new DefaultPackageManager({cwd, agentDir, settingsManager});
  try {
    const resolved = await manager.resolve(() => { throw new Error('Unexpected missing package'); });
    const actual = resolved.extensions.map(e=>[relative(ext,e.path),e.enabled]).sort((a,b)=>a[0].localeCompare(b[0]));
    const expected = [...c.expected].sort((a,b)=>a[0].localeCompare(b[0]));
    assert.deepEqual(actual, expected);
    assert.equal(resolved.skills.length + resolved.prompts.length + resolved.themes.length, 0);
    results.push({id:c.id,passed:true,files:c.files,overrides:c.overrides??[],manifest:c.manifest??null,ignore:c.ignore??null,expected,actual,resources:resolved.extensions.map(e=>({...e,path:relative(root,e.path),metadata:{...e.metadata,baseDir:relative(root,e.metadata.baseDir)}}))});
  } catch (error) { results.push({id:c.id,passed:false,error:String(error)}); }
}
assert.deepEqual(blocked, []);
const hashes = Object.fromEntries(['package.json','dist/core/package-manager.js','dist/config.js','dist/core/pi-manifest.js','dist/utils/paths.js'].map(name=>[name,createHash('sha256').update(fs.readFileSync(join(pkg,name))).digest('hex')]));
const output = {scope:'installed DefaultPackageManager.resolve discovery only; no extension loading',node:process.version,platform:process.platform,arch:process.arch,package:{name:identity.name,version:identity.version},hashes,safety:{syntheticHome:true,explicitAgentDirAndCwd:true,emptyPackageLists:true,projectTrusted:false,nodePermissions:true,childAndWorkersDenied:true,packageWritesDenied:true,realSettingsReadDenied:true,blockedSideEffectAttempts:blocked},results,passed:results.every(r=>r.passed)};
fs.writeFileSync(join(root,'results.json'), JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({passed:output.passed,cases:results.length,failures:results.filter(r=>!r.passed)}));
if (!output.passed) process.exitCode=1;
