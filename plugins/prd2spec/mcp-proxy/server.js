import express from 'express';
import cors from 'cors';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const app = express();
const PORT = 3456;

app.use(cors());
app.use(express.json());

// MCP client pool (keyed by server name)
const mcpClients = new Map();

// Initialize MCP client for a given server
async function getMcpClient(serverName, command, args, env) {
  if (mcpClients.has(serverName)) {
    return mcpClients.get(serverName);
  }

  const transport = new StdioClientTransport({
    command,
    args,
    env: { ...process.env, ...env },
  });

  const client = new Client(
    { name: 'prd2spec-proxy', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  mcpClients.set(serverName, client);
  return client;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// POST /mcp/call
// Body: { server, command, args, env, tool, toolInput }
app.post('/mcp/call', async (req, res) => {
  try {
    const { server, command, args, env, tool, toolInput } = req.body;

    if (!server || !command || !tool) {
      return res.status(400).json({ error: 'Missing required fields: server, command, tool' });
    }

    const client = await getMcpClient(server, command, args || [], env || {});

    // Call the MCP tool
    const result = await client.callTool({ name: tool, arguments: toolInput || {} });

    res.json({ ok: true, result });
  } catch (err) {
    console.error('[mcp-proxy] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n[mcp-proxy] Shutting down...');
  for (const [name, client] of mcpClients) {
    console.log(`[mcp-proxy] Closing ${name}...`);
    client.close().catch(console.error);
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`[mcp-proxy] Listening on http://localhost:${PORT}`);
  console.log('[mcp-proxy] Browser extension can now call MCP servers via HTTP');
});
