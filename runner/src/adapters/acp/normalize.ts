import crypto from 'node:crypto';
import type {AdapterOutput, TurnResult} from '../types.ts';

export class AcpNormalizer {
  private ignored=new Set<string>();
  private item?:{id:string;type:'assistant.text'|'reasoning';text:string};
  private emit:(o:AdapterOutput)=>void;
  constructor(emit:(o:AdapterOutput)=>void){this.emit=emit;}
  flush():void {
    if(!this.item)return;
    this.emit({kind:'event',event:{type:this.item.type,itemId:this.item.id,text:this.item.text}});this.item=undefined;
  }
  update(u:any):void {
    const kind=u?.sessionUpdate;
    const tool=u?.rawInput?.tool_name??u?.name??'';
    if(/^(?:threadbear__|mcp_threadbear_)/.test(tool))this.ignored.add(String(u.toolCallId));
    if(this.ignored.has(String(u?.toolCallId)))return;
    if(kind==='agent_message_chunk'||kind==='agent_thought_chunk') {
      if(u.content?.type!=='text'||typeof u.content.text!=='string')return;
      const type=kind==='agent_message_chunk'?'assistant.text':'reasoning';
      if(this.item?.type!==type)this.flush();
      this.item??={id:crypto.randomUUID(),type,text:''};this.item.text+=u.content.text;
      this.emit({kind:'delta',delta:{type:type==='reasoning'?'reasoning.delta':'assistant.text.delta',itemId:this.item.id,text:u.content.text}});
    } else if(kind==='tool_call') {
      this.flush();
      const title=String(u.title??'Tool');
      this.emit({kind:'event',event:{type:'tool.call',itemId:String(u.toolCallId),name:title,kind:'other',title,input:u.rawInput&&typeof u.rawInput==='object'?u.rawInput:{}}});
    } else if(kind==='tool_call_update'&&['completed','failed'].includes(u.status)) {
      this.emit({kind:'event',event:{type:'tool.result',itemId:String(u.toolCallId),ok:u.status==='completed',text:JSON.stringify(u.rawOutput??u.content??''),truncated:false,images:[]}});
    }
  }
}

// Only explicit subscription quota wording. A generic rate limit, denial,
// auth failure or 429 cannot move a conversation to another provider.
export function acpFailure(error:unknown):Pick<TurnResult,'outcome'|'error'|'errorKind'> {
  const text=error instanceof Error?error.message:String(error);
  const limit=/(?:subscription|plan|weekly|5.hour) (?:usage )?(?:limit|quota).*(?:reached|exhausted|exceeded)|(?:reached|exhausted|exceeded).*(?:subscription|plan) (?:usage )?(?:limit|quota)/i.test(text);
  return {outcome:'failed',error:text,...(limit?{errorKind:'usageLimit' as const}:{})};
}
