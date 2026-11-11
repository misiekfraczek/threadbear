import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { acpTools } from '../../src/adapters/subscription-acp/tools.ts';
import { AcpTransport } from '../../src/adapters/subscription-acp/transport.ts';
import { tmpDir } from '../helpers/fakes.ts';
import type { AdapterOutput } from '../../src/adapters/types.ts';

test('the actual MCP bridge routes tools, validates input and enforces denial', async () => {
  let calls = 0;
  let allow = false;
  const events: AdapterOutput[] = [];
  const bridge = await acpTools(
    [
      {
        name: 'delete_thread',
        description: 'Synthetic tool',
        inputSchema: { threadId: z.string() },
        handler: async (args) => {
          calls++;
          return { content: [{ type: 'text', text: args.threadId }] };
        },
      },
    ],
    { cwd: () => tmpDir(), mode: () => 'full', rules: () => [], addRules: () => {}, requestApproval: async () => ({ decision: allow ? 'allow' : 'deny' }) },
    new AbortController().signal,
    (o) => events.push(o),
  );
  const rpc = new AcpTransport(
    bridge.config.command,
    bridge.config.args,
    tmpDir(),
    process.env,
    () => {},
    async () => ({}),
    () => {},
  );
  try {
    const init = await rpc.call('initialize', { protocolVersion: '2024-11-05' });
    assert.equal(init.serverInfo.name, 'threadbear');
    assert.equal((await rpc.call('tools/list', {})).tools[0].name, 'delete_thread');
    const denied = await rpc.call('tools/call', { name: 'delete_thread', arguments: { threadId: 'test' } });
    assert.equal(denied.isError, true);
    assert.equal(calls, 0);
    allow = true;
    const result = await rpc.call('tools/call', { name: 'delete_thread', arguments: { threadId: 'test' } });
    assert.equal(result.content[0].text, 'test');
    assert.equal(calls, 1);
    const bad = await rpc.call('tools/call', { name: 'delete_thread', arguments: { threadId: 42 } });
    assert.equal(bad.isError, true);
    assert.equal(calls, 1);
    assert.ok(events.some((o) => o.kind === 'event' && o.event.type === 'tool.call' && o.event.name === 'mcp__threadbear__delete_thread'));
  } finally {
    await rpc.end();
    bridge.close();
  }
});
