import net from 'node:net';
import { spawn } from 'node:child_process';
import { expect, it } from 'vitest';
import { LOOPBACK_ONLY_PROFILE } from './native-start.js';
it.skipIf(process.platform !== 'darwin')('the real macOS profile permits loopback and rejects external network', async () => {
  const server = net.createServer(socket => socket.end());
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  // No Agent/configuration/credentials. TEST-NET-1 is a reserved documentation address.
  const source = `const net=require('node:net');const test=(host,port)=>new Promise(done=>{
const socket=net.connect({host,port});socket.once('connect',()=>{socket.destroy();done('connected')});
socket.once('error',error=>{socket.destroy();done(error.code)});socket.setTimeout(800,()=>{socket.destroy();done('timeout')})});
(async()=>console.log(JSON.stringify({loopback:await test('127.0.0.1',${port}),external:await test('192.0.2.1',443)})))();`;
  const child = spawn('/usr/bin/sandbox-exec', ['-p', LOOPBACK_ONLY_PROFILE, process.execPath, '-e', source], {
    env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.resume();
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => { child.once('close', resolve); child.once('error', reject); });
    expect(code).toBe(0); expect(JSON.parse(output)).toEqual({ loopback: 'connected', external: 'EPERM' });
  } finally { clearTimeout(timer); child.kill('SIGKILL'); await new Promise<void>(resolve => server.close(() => resolve())); }
});
