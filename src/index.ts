import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, TOOL_REGISTRATIONS } from './server.js';
import { getStore } from './db.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'survey-data-mcp' });
});

// MCP endpoint — stateless, new server + transport per request
app.post('/mcp', async (req, res) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

// GET /mcp — return 200 so mcp-remote sees "no auth required"
app.get('/mcp', (_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.end();
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
});

const PORT = process.env.PORT || 3005;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(Number(PORT), HOST, () => {
  const store = getStore();
  const toolNames = TOOL_REGISTRATIONS.map((fn) =>
    fn.name.replace(/^register/, '').replace(/^./, (c) => c.toLowerCase()),
  );
  console.log(`Survey Data MCP server listening on ${HOST}:${PORT}`);
  console.log(`Responses: ${store.allResponses.length} total, ${store.execOnly.length} exec-only`);
  console.log(`Questions: ${store.questions.length}`);
  console.log(`Tools (${toolNames.length}): ${toolNames.join(', ')}`);
});
