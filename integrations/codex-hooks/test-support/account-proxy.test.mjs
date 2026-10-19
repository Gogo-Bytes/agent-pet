import net from 'node:net';
import {expect,it,vi} from 'vitest';
import {startAccountProxy} from './account-proxy.mjs';
async function request(proxy,target,authorize=true,method='CONNECT',keepAlive=false) {
 const url=new URL(proxy.environment.HTTPS_PROXY);
 const auth=Buffer.from(decodeURIComponent(url.username)+':'+decodeURIComponent(url.password)).toString('base64');
 return new Promise((resolve,reject)=>{
  const socket=net.connect({host:'127.0.0.1',port:Number(url.port)});
  const timer=setTimeout(()=>{socket.destroy();reject(new Error('fixture timeout'));},1000);
  socket.once('connect',()=>socket.write(`${method} ${target} HTTP/1.1\r\nHost: ${target}\r\n${authorize?'Proxy-Authorization: Basic '+auth+'\r\n':''}\r\n`));
  socket.once('data',data=>{clearTimeout(timer);if(!keepAlive)socket.destroy();resolve(keepAlive?{response:data.toString(),socket}:data.toString());});
  socket.once('error',error=>{clearTimeout(timer);reject(error);});
 });
}
it('refuses every other destination, unauthenticated tunnels and plain HTTP without connecting outward',async()=>{
 const connect=vi.fn();const proxy=await startAccountProxy({connect});
 try {
  for(const target of ['example.com:443','chatgpt.com:80','chatgpt.com.evil:443','127.0.0.1:443','chatgpt.com:443@evil'])
    expect(await request(proxy,target)).toContain('403 Forbidden');
  expect(await request(proxy,'chatgpt.com:443',false)).toContain('403 Forbidden');
  expect(await request(proxy,'https://chatgpt.com/',true,'GET')).toContain('403 Forbidden');
  expect(connect).not.toHaveBeenCalled();
 } finally{await proxy.stop();}
});
it('accepts only the authenticated fixed TLS route and closes active fixture tunnels on stop',async()=>{
 const peers=new Set();const upstream=net.createServer(socket=>{socket.pipe(socket);peers.add(socket);socket.once('close',()=>peers.delete(socket));});
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const connect=vi.fn(()=>net.connect({host:'127.0.0.1',port:upstream.address().port}));
 const proxy=await startAccountProxy({connect});
 try{
  const tunnel=await request(proxy,'chatgpt.com:443',true,'CONNECT',true);
  expect(tunnel.response).toContain('200 Connection Established');expect(connect).toHaveBeenCalledTimes(1);
  const data=new Promise(resolve=>tunnel.socket.once('data',chunk=>resolve(chunk.toString())));
  tunnel.socket.write('opaque fixture');expect(await data).toBe('opaque fixture');
  const closed=new Promise(resolve=>tunnel.socket.once('close',resolve));
  await proxy.stop();await closed;expect(tunnel.socket.destroyed).toBe(true);
 }
 finally{await proxy.stop();await proxy.stop();for(const socket of peers)socket.destroy();await new Promise(resolve=>upstream.close(resolve));}
});
