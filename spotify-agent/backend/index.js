import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import ollama from 'ollama';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

let mcpClient = null;

async function setupMcpClient() {
  const mcpServerPath = path.resolve(__dirname, '../../spotify-MCP-server/build/index.js');
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: [mcpServerPath],
  });

  mcpClient = new Client({
    name: 'spotify-agent',
    version: '1.0.0',
  }, {
    capabilities: {}
  });

  await mcpClient.connect(transport);
  console.log('Connected to Spotify MCP Server');
}

setupMcpClient().catch(console.error);

app.get('/api/tools', async (req, res) => {
  if (!mcpClient) return res.status(500).json({ error: 'MCP client not ready' });
  try {
    const tools = await mcpClient.listTools();
    res.json(tools);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tools/:name', async (req, res) => {
  if (!mcpClient) return res.status(500).json({ error: 'MCP client not ready' });
  try {
    const result = await mcpClient.callTool({
      name: req.params.name,
      arguments: req.body
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for LLM chat loop
app.post('/api/chat', async (req, res) => {
  if (!mcpClient) return res.status(500).json({ error: 'MCP client not ready' });
  
  // You can change 'gemma' to 'gemma2', 'llama3', etc. depending on what you downloaded via Ollama
  const { messages, model = 'gemma4:e2b' } = req.body;
  
  try {
    // 1. Fetch MCP tools and map them to Ollama format
    const mcpToolsRes = await mcpClient.listTools();
    const ollamaTools = mcpToolsRes.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));

    // 2. Call Ollama
    const response = await ollama.chat({
      model,
      messages,
      tools: ollamaTools
    });

    let toolCallsExecuted = [];

    // 3. Handle tool calls if any
    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      messages.push(response.message);
      
      for (const call of response.message.tool_calls) {
        console.log(`Executing tool from LLM: ${call.function.name}`);
        try {
          const result = await mcpClient.callTool({
            name: call.function.name,
            arguments: call.function.arguments
          });
          
          toolCallsExecuted.push({ name: call.function.name, result });

          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            // Note: Ollama format might vary slightly for tool responses depending on version,
            // but appending it as a tool/user message usually works to feed back data.
          });
        } catch (toolError) {
          console.error('Tool error:', toolError);
          messages.push({
            role: 'tool',
            content: `Error executing tool: ${toolError.message}`
          });
        }
      }
      
      // 4. Call Ollama again to generate the final response with the tool output
      const finalResponse = await ollama.chat({
        model,
        messages,
        tools: ollamaTools
      });
      
      res.json({ message: finalResponse.message, toolCalls: toolCallsExecuted });
    } else {
      res.json({ message: response.message, toolCalls: [] });
    }

  } catch (error) {
    console.error('LLM Chat Error:', error);
    res.status(500).json({ error: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('Frontend connected');
  socket.on('disconnect', () => {
    console.log('Frontend disconnected');
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
