// ACP's JSON-RPC transport. One official CLI/process group per session.
import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {killGroup, type ProcessRegistry} from '../../proc.ts';

export class AcpError extends Error {
  readonly data?: unknown;
  constructor(message: string, data?: unknown) { super(message);this.data=data; }
}
export class AcpTransport {
  private child;
  private seq = 0;
  private buffer = '';
  private decoder = new StringDecoder('utf8');
  private pending = new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer?:NodeJS.Timeout}>();
  private closed = false;
  private closing = false;
  private stopped: Promise<void>;
  private notify:(method:string,params:any)=>void;
  private request:(method:string,params:any)=>Promise<unknown>;
  private exit:(error?:Error)=>void;
  private registry?:Pick<ProcessRegistry,'add'|'remove'> & Partial<Pick<ProcessRegistry,'toolGroups'>>;
  constructor(command:string,args:string[],cwd:string,env:NodeJS.ProcessEnv,
    notify:(method:string,params:any)=>void,
    request:(method:string,params:any)=>Promise<unknown>,
    exit:(error?:Error)=>void,
    registry?:Pick<ProcessRegistry,'add'|'remove'> & Partial<Pick<ProcessRegistry,'toolGroups'>>) {
    this.notify=notify;this.request=request;this.exit=exit;this.registry=registry;
    this.child=spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe'],detached:true});
    if(this.child.pid) registry?.add(this.child.pid,command);
    this.child.stdout.on('data',(b:Buffer)=>this.read(this.decoder.write(b)));
    // CLI diagnostics can include user content. Drain without logging it.
    this.child.stderr.resume();
    this.child.on('error',e=>this.fail(e));
    this.stopped=new Promise(resolve=>this.child.on('close',()=>{
      if(this.child.pid) {
        for(const group of registry?.toolGroups?.(this.child.pid)??[])killGroup(group,'SIGKILL');
        killGroup(this.child.pid,'SIGKILL');
        registry?.remove(this.child.pid);
      }
      this.fail(this.closing?undefined:new Error('CLI exited before the ACP session closed.'));
      resolve();
    }));
  }
  private read(chunk:string):void {
    this.buffer+=chunk;
    if(Buffer.byteLength(this.buffer)>16*1024*1024){this.fail(new Error('ACP frame exceeds 16 MB.'));this.kill();return;}
    let end:number;
    while((end=this.buffer.indexOf('\n'))>=0) {
      const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);
      if(!line.trim())continue;
      let m:any;
      try{m=JSON.parse(line);}catch{this.fail(new Error('Invalid JSON from the CLI.'));this.kill();return;}
      if(typeof m.method==='string') {
        if(m.id!==undefined) void this.request(m.method,m.params).then(result=>this.write({jsonrpc:'2.0',id:m.id,result}),()=>this.write({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Unsupported client request'}}));
        else this.notify(m.method,m.params);
      } else {
        const pending=this.pending.get(m.id);
        if(!pending)continue;
        this.pending.delete(m.id);clearTimeout(pending.timer);
        if(m.error)pending.reject(new AcpError(String(m.error.message??'ACP request failed'),m.error.data));
        else if('result' in m)pending.resolve(m.result);
        else pending.reject(new Error('ACP reply has no result.'));
      }
    }
  }
  private write(m:unknown):void {
    if(!this.closed && !this.child.stdin.destroyed)this.child.stdin.write(JSON.stringify(m)+'\n', e=>{if(e)this.fail(e);});
  }
  call(method:string,params:unknown,timeoutMs=30_000):Promise<any> {
    if(this.closed)return Promise.reject(new Error('ACP transport is closed.'));
    const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const timer=timeoutMs?setTimeout(()=>{this.pending.delete(id);reject(new Error(`ACP ${method} timed out.`));this.kill();},timeoutMs):undefined;
      this.pending.set(id,{resolve,reject,timer});this.write({jsonrpc:'2.0',id,method,params});
    });
  }
  tell(method:string,params:unknown):void {this.write({jsonrpc:'2.0',method,params});}
  private fail(error?:Error):void {
    if(this.closed)return;this.closed=true;
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error??new Error('ACP session closed.'));}
    this.pending.clear();this.exit(error);
  }
  kill():void {this.closing=true;if(this.child.pid)killGroup(this.child.pid,'SIGKILL');}
  async end():Promise<void> {
    this.closing=true;this.child.stdin.end();
    const timer=setTimeout(()=>this.kill(),1500);
    await this.stopped;clearTimeout(timer);
  }
}
