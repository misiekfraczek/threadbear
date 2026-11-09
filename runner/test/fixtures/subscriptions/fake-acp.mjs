// Synthetic ACP server. No provider login, network or real conversation.
import readline from 'node:readline';
const scenario = process.argv[2] ?? 'ok';
let prompt;
let prompts=0;
const send = m => process.stdout.write(JSON.stringify(m)+'\n');
for await (const line of readline.createInterface({input:process.stdin})) {
  const m = JSON.parse(line);
  const reply = result => send({jsonrpc:'2.0',id:m.id,result});
  if (scenario==='auth-fail' && (m.method==='authenticate'||m.method==='session/new'||m.method==='session/load')) {send({jsonrpc:'2.0',id:m.id,error:{code:-32000,message:'Authentication required'}});continue;}
  if (m.method==='initialize') reply({protocolVersion:1,agentCapabilities:{loadSession:true},agentInfo:{version:'test'}});
  else if(m.method==='authenticate') reply({_meta:{auth_mode:'Oidc',subscription_tier:'SuperGrok Plus',backend_billed:false}});
  else if(m.method==='session/new'||m.method==='session/load') {
    send({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'OLD HISTORY'}}}});
    reply({sessionId:m.params.sessionId??'native-test',_meta:{antigravity:{tier:{id:'g1-pro-tier',name:'Google AI Pro'}}},models:{availableModels:[{modelId:'grok-test',name:'Grok'},{modelId:'gemini-test',name:'Gemini'},{modelId:'claude-test',name:'Claude'}]}});
  } else if(m.method==='session/set_model'||m.method==='session/set_config_option') reply({});
  else if(m.method==='session/prompt') {
    prompt=m.id;prompts++;
    if(scenario==='wait'||scenario==='queued-after-cancel') send({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'PROMPT_STARTED'}}}});
    if(scenario==='queued-after-cancel'&&prompts===1)continue;
    if(scenario==='eof') process.exit(0);
    if(scenario==='bad-json') {process.stdout.write('{bad}\n');continue;}
    if(scenario==='wait') continue;
    if(scenario==='429'||scenario==='limit') {send({jsonrpc:'2.0',id:m.id,error:{code:429,message:scenario==='limit'?'Your subscription usage limit has been reached':'Too many requests'}});continue;}
    send({jsonrpc:'2.0',method:'unknown/event',params:{}});
    const chunk=JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'OK'}}}})+'\n';
    process.stdout.write(chunk.slice(0,17)); await new Promise(r=>setTimeout(r,5));process.stdout.write(chunk.slice(17));
    reply({stopReason:'end_turn'});
  } else if(m.method==='session/cancel') send({jsonrpc:'2.0',id:prompt,result:{stopReason:'cancelled'}});
  else if(m.id!==undefined) reply({});
}
