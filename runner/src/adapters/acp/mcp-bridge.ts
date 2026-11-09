// A stdio MCP child forwards to its session's loopback-only tool router.
// The random path is scoped to the lifetime of that session, not a login.
import readline from 'node:readline';
const endpoint=process.argv[2];
for await(const line of readline.createInterface({input:process.stdin})) {
  let m:any;
  try {m=JSON.parse(line);} catch {continue;}
  if(m.id===undefined)continue;
  void fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)})
    .then(r=>r.json()).then(r=>process.stdout.write(JSON.stringify(r)+'\n'))
    .catch(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:'Threadbear tool connection closed.'}})+'\n'));
}
