import http from 'node:http';
import net from 'node:net';
import {randomBytes,timingSafeEqual} from 'node:crypto';
/** Fixed peer, including the implicit HTTPS port; never route using request text. */
export const isOfficialAuthority=value=>typeof value==='string' && /^chatgpt\.com(?::443)?$/i.test(value);
/** Test-only CONNECT gateway. No credential/body/header logging; one fixed TLS destination. */
export async function startAccountProxy({connect=()=>net.connect({host:'chatgpt.com',port:443})}={}) {
  const password=randomBytes(32).toString('hex');
  const expected=Buffer.from('Basic '+Buffer.from('agent-pet:'+password).toString('base64'));
  const sockets=new Set(),clients=new Set(),pending=[];
  const counters={clients:0,capacityRejected:0,stoppedRejected:0,budgetExhausted:0,blockedAuthService:0,blockedApiService:0,blockedChatSubdomain:0,blockedOther:0,
    accepted:0,blockedDestination:0,blockedAuthentication:0,blockedHttp:0,connected:0,upstreamFailed:0,clientBytes:0,serverBytes:0};
  const errors={};
  let stopped=false,active=0,remaining=2*1024*1024;
  const destroyAll=()=>{for(const socket of sockets)socket.destroy();};
  const drain=()=>{
    while(!stopped && active<8 && pending.length) {
      const start=pending.shift();start();
    }
  };
  const server=http.createServer({maxHeaderSize:4096},(_request,response)=>{counters.blockedHttp++;response.writeHead(403);response.end();});
  server.headersTimeout=2000;server.requestTimeout=2000;
  const lifetime=setTimeout(()=>{stopped=true;pending.length=0;destroyAll();},180000);
  server.on('connection',socket=>{
    counters.clients++;
    if(stopped){counters.stoppedRejected++;socket.destroy();return;}
    if(clients.size>=32){counters.capacityRejected++;socket.destroy();return;}
    clients.add(socket);sockets.add(socket);socket.setTimeout(3000,()=>socket.destroy());socket.on('error',()=>{});
    socket.once('close',()=>{sockets.delete(socket);clients.delete(socket);});
  });
  server.on('clientError',(_error,socket)=>socket.destroy());
  server.on('connect',(request,client,head)=>{
    const supplied=Buffer.from(request.headers['proxy-authorization']??'');
    if(stopped || !isOfficialAuthority(request.url) || head.length>16384 ||
      supplied.length!==expected.length || !timingSafeEqual(supplied,expected)) {
      if(!isOfficialAuthority(request.url)){
        counters.blockedDestination++;
        const category=request.url==='auth.openai.com:443'?'blockedAuthService':request.url==='api.openai.com:443'?'blockedApiService':/^[a-z0-9-]+\.chatgpt\.com:443$/.test(request.url??'')?'blockedChatSubdomain':'blockedOther';
        counters[category]++;
      }else counters.blockedAuthentication++;
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    counters.accepted++;client.setTimeout(15000,()=>client.destroy());
    const start=()=>{
      if(stopped || client.destroyed)return;
      active++;
      let upstream;
      try{upstream=connect();}catch{active--;counters.upstreamFailed++;client.destroy();return;}
      sockets.add(upstream);
      const close=()=>{client.destroy();upstream.destroy();};
      const count=chunk=>{remaining-=chunk.length;if(remaining<0 && !stopped){counters.budgetExhausted++;stopped=true;pending.length=0;destroyAll();}};
      count(head);
      client.on('data',chunk=>{counters.clientBytes+=chunk.length;count(chunk);});
      upstream.on('data',chunk=>{counters.serverBytes+=chunk.length;count(chunk);});
      client.once('close',()=>upstream.destroy());
      upstream.once('close',()=>{active--;sockets.delete(upstream);client.destroy();drain();});
      upstream.on('error',error=>{
        counters.upstreamFailed++;
        const code=['ENOTFOUND','EAI_AGAIN','EPERM','EACCES','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH'].includes(error.code)?error.code:'other';
        errors[code]=(errors[code]??0)+1;close();
      });
      upstream.setTimeout(15000,close);
      upstream.once('connect',()=>{
        if(stopped || client.destroyed){close();return;}
        counters.connected++;
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if(head.length)upstream.write(head);
        client.pipe(upstream);upstream.pipe(client);
      });
    };
    client.once('close',()=>{const index=pending.indexOf(start);if(index>=0)pending.splice(index,1);});
    pending.push(start);drain();
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
  catch(error){clearTimeout(lifetime);throw error;}
  const url=`http://agent-pet:${password}@127.0.0.1:${server.address().port}`;
  return {summary:()=>({...counters,errors:{...errors}}),environment:{HTTPS_PROXY:url,https_proxy:url,HTTP_PROXY:url,http_proxy:url,
    NO_PROXY:'localhost,127.0.0.1',no_proxy:'localhost,127.0.0.1'},
    async stop(){stopped=true;clearTimeout(lifetime);pending.length=0;destroyAll();await new Promise(resolve=>server.close(resolve));}
  };
}
