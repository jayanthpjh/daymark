import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { createMailboxTransport } from '../mailbox-transport.mjs';

async function smtp(t,{drop=false}={}) {
  const accepted=[];const sockets=new Set();
  const server=net.createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 localhost synthetic SMTP\r\n');
    let buffer='',data=false,body='';
    socket.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
      if(data){if(line==='.') {data=false;accepted.push(body);if(drop)socket.destroy();else socket.write('250 2.0.0 accepted\r\n');}else body+=line+'\r\n';continue;}
      if(line.startsWith('EHLO'))socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
      else if(line.startsWith('AUTH'))socket.write('235 authenticated\r\n');
      else if(line==='DATA'){data=true;body='';socket.write('354 send data\r\n');}
      else if(line==='QUIT'){socket.end('221 bye\r\n');}
      else socket.write('250 OK\r\n');
    }});
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{for(const socket of sockets)socket.destroy();return new Promise(r=>server.close(r));});
  const transport=createMailboxTransport({readEnv:async()=>({PROTON_BRIDGE_HOST:'127.0.0.1',PROTON_BRIDGE_USER:'test@example.test',PROTON_BRIDGE_SMTP_PORT:server.address().port,PROTON_BRIDGE_MODE:'plain'}),getPassword:async()=>'synthetic-password'});
  return {transport,accepted};
}
test('real Nodemailer SMTP transport preserves message identity, reply headers and file bytes',async t=>{
  const {transport,accepted}=await smtp(t);const result=await transport.send({from:'applicant@example.test',to:'recruiter@example.test',subject:'Synthetic reply',text:'Thank you',messageId:'<stable@example.test>',inReplyTo:'<parent@example.test>',references:['<root@example.test>','<parent@example.test>'],attachments:[{filename:'resume.txt',content:Buffer.from('resume')}]});
  assert.deepEqual(result.accepted,['recruiter@example.test']);assert.equal(accepted.length,1);assert.match(accepted[0],/Message-ID: <stable@example.test>/);assert.match(accepted[0],/In-Reply-To: <parent@example.test>/);assert.match(accepted[0],/resume.txt/);
});
test('a disconnect after DATA raises an error instead of reporting a successful delivery',async t=>{
  const {transport,accepted}=await smtp(t,{drop:true});await assert.rejects(transport.send({from:'a@example.test',to:'b@example.test',subject:'test',text:'synthetic'}));assert.equal(accepted.length,1);
});
