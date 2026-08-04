import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TOKEN = process.env.MG_TOKEN || 'your-token-here';
const FILE_ID = '190810564394066';
const LAYER_ID = '217:34061';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@mastergo/magic-mcp', `--token=${TOKEN}`, '--url=https://mastergo.iflytek.com'],
  env: process.env,
});

const client = new Client(
  { name: 'test', version: '1.0.0' },
  { capabilities: {} }
);

console.log('Connecting to MCP...');
await client.connect(transport);

console.log('\n=== Test 1: getDsl with fileId + layerId ===');
try {
  const result = await client.callTool({
    name: 'mcp__getDsl',
    arguments: { fileId: FILE_ID, layerId: LAYER_ID }
  });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('Error:', err.message);
}

console.log('\n=== Test 2: getDsl with fileId only ===');
try {
  const result = await client.callTool({
    name: 'mcp__getDsl',
    arguments: { fileId: FILE_ID }
  });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('Error:', err.message);
}

client.close();
