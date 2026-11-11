import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { AdapterOutput } from '../types.ts';
import { CodexTools, type ToolDefinition, type CodexToolsDeps } from '../codex/tools.ts';

export async function acpTools(tools: ToolDefinition[], deps: CodexToolsDeps, signal: AbortSignal, emit: (o: AdapterOutput) => void = () => {}) {
  const router = new CodexTools(tools, deps);
  let calls = 0;
  const route = '/' + crypto.randomBytes(32).toString('hex');
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== route) {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 1024 * 1024) {
          res.writeHead(413).end();
          return;
        }
      }
      const m = JSON.parse(body);
      let result: unknown;
      if (m.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'threadbear', version: '1' } };
      else if (m.method === 'ping') result = {};
      else if (m.method === 'tools/list')
        result = {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: z.toJSONSchema(z.object(t.inputSchema as any)),
            annotations: t.annotations,
          })),
        };
      else if (m.method === 'tools/call') {
        const itemId = `threadbear-${++calls}`;
        emit({
          kind: 'event',
          event: {
            type: 'tool.call',
            itemId,
            name: `mcp__threadbear__${m.params?.name}`,
            kind: 'mcp',
            title: String(m.params?.name),
            input: m.params?.arguments ?? {},
          },
        });
        const r = await router.call(
          { threadId: '', turnId: '', namespace: 'threadbear', tool: m.params?.name, arguments: m.params?.arguments, callId: itemId },
          { fromChild: false, signal },
        );
        emit({
          kind: 'event',
          event: {
            type: 'tool.result',
            itemId,
            ok: r.success,
            text: r.contentItems
              .filter((c) => c.type === 'inputText')
              .map((c) => c.text)
              .join('\n'),
            truncated: false,
            images: [],
          },
        });
        result = {
          isError: !r.success,
          content: r.contentItems.map((c) => (c.type === 'inputText' ? { type: 'text', text: c.text } : { type: 'text', text: 'Unsupported tool content' })),
        };
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not found' } }));
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }));
    } catch {
      res.writeHead(400).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as { port: number }).port;
  return {
    config: {
      name: 'threadbear',
      command: process.execPath,
      args: [path.join(import.meta.dirname, 'mcp-bridge.ts'), `http://127.0.0.1:${port}${route}`],
      env: [],
    },
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
