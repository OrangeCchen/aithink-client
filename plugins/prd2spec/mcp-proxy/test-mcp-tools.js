import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@mastergo/magic-mcp', '--token=dummy', '--url=https://mastergo.iflytek.com'],
  env: process.env,
});

const client = new Client(
  { name: 'test', version: '1.0.0' },
  { capabilities: {} }
);

await client.connect(transport);
const tools = await client.listTools();
console.log('Available tools:');
console.log(JSON.stringify(tools, null, 2));
client.close();
