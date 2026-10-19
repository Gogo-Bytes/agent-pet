import http from 'node:http';
import net from 'node:net';
import {randomBytes,timingSafeEqual} from 'node:crypto';
/** Test-only CONNECT gateway. No credential/body/header logging; one fixed TLS destination. */
export async function startAccountProxy({connect=()=>net.connect({host:'chatgpt.com',port:443})}={}) {
  const password=randomBytes(32).toString('hex');
  const expected=Buffer.from('Basic '+Buffer.from('agent-pet:'+password).toString('base64'));
  const sockets=new Set();
  let stopped=false;
  const server=http.createServer({maxHeaderSize:4096},(_request,response)=>{response.writeHead(403);response.end();});
  server.headersTimeout=2000;server.requestTimeout=2000;
  server.on('connection',socket=>{
    if(stopped || sockets.size>=8){socket.destroy();return;}
    sockets.add(socket);socket.setTimeout(3000,()=>socket.destroy());socket.on('error',()=>{});
    socket.once('close',()=>sockets.delete(socket));
  });
  server.on('clientError',(_error,socket)=>socket.destroy());
  server.on('connect',(request,client,head)=>{
    const supplied=Buffer.from(request.headers['proxy-authorization']??'');
    if(stopped || request.url!=='chatgpt.com:443' || head.length>16384 ||
      supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    let upstream;
    try {upstream=connect();}catch{client.destroy();return;}
    sockets.add(upstream);
    const close=()=>{client.destroy();upstream.destroy();};
    const deadline=setTimeout(close,180000);
    let remaining=2*1024*1024;
    const count=chunk=>{remaining-=chunk.length;if(remaining<0)close();};
    client.on('data',count);upstream.on('data',count);
    client.once('close',()=>{clearTimeout(deadline);upstream.destroy();});
    upstream.once('close',()=>{clearTimeout(deadline);sockets.delete(upstream);client.destroy();});
    upstream.on('error',close);upstream.setTimeout(15000,close);
    upstream.once('connect',()=>{
      if(stopped || client.destroyed){close();return;}
      client.setTimeout(15000,close);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if(head.length)upstream.write(head);
      client.pipe(upstream);upstream.pipe(client);
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  // Native Codex keeps end-to-end TLS; the gateway cannot read account payloads.
  const url=`http://agent-pet:${password}@127.0.0.1:${server.address().port}`;
  return {environment:{HTTPS_PROXY:url,https_proxy:url,HTTP_PROXY:url,http_proxy:url,
    NO_PROXY:'localhost,127.0.0.1',no_proxy:'localhost,127.0.0.1'},
    async stop(){if(stopped)return;stopped=true;for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}
  };
}
