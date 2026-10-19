import {constants} from 'node:fs';
import {open,lstat,unlink} from 'node:fs/promises';
/** Test-only credential lease. Never returns/logs credentials or writes the source. */
export async function withTemporaryAuth(source,target,operation) {
  let input,output,bytes,created;
  try {
    input=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW);
    const info=await input.stat();
    if(!info.isFile() || info.uid!==process.getuid() || info.nlink!==1 ||
      (info.mode&0o7777)!==0o600 || info.size<1 || info.size>65536) throw new Error('Unsafe authentication source');
    bytes=Buffer.alloc(65537);
    let length=0;
    while(length<bytes.length) {
      const result=await input.read(bytes,length,bytes.length-length,null);
      if(result.bytesRead===0)break;length+=result.bytesRead;
    }
    const after=await input.stat();
    if(length!==info.size || after.size!==info.size || after.mtimeMs!==info.mtimeMs || after.ctimeMs!==info.ctimeMs)
      throw new Error('Authentication source changed');
    await input.close();input=undefined;
    output=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    created=await output.stat();
    await output.writeFile(bytes.subarray(0,length));
    await output.close();output=undefined;
    bytes.fill(0);bytes=undefined;
    return await operation();
  } finally {
    bytes?.fill(0);
    await input?.close();await output?.close();
    if(created) {
      const now=await lstat(target).catch(error=>{if(error.code!=='ENOENT')throw error;});
      if(now) {
        if(!now.isFile() || now.dev!==created.dev || now.ino!==created.ino || now.uid!==process.getuid() || now.nlink!==1)
          throw new Error('Temporary authentication changed');
        await unlink(target);
      }
    }
  }
}
