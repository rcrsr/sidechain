#!/usr/bin/env node

/**
 * MCP server entry point for Sidechain
 * Covers: IC-13
 *
 * Exposes Store operations as MCP tools via JSON-RPC 2.0 over stdio.
 * Tool names follow pattern: sidechain_operation_name
 * All tools return: { ok: true, ...result } or { ok: false, error, message }
 *
 * Configuration loaded from sidechain.json in cwd or MCP_CONFIG env var.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

import { Sidechain } from '../core/store.js';
import {
  DEFAULT_CONFIG_FILE,
  MCP_PROTOCOL_VERSION,
} from '../shared/constants.js';
import { formatError } from '../shared/format-error.js';
import type { SidechainConfig } from '../types/config.js';
import type { ControlPlane } from '../types/control-plane.js';
import type { Store } from '../types/store.js';
import { routeToolCall } from './router.js';
import { TOOL_DEFINITIONS } from './tools.js';

/**
 * JSON-RPC 2.0 request structure
 */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC 2.0 response structure
 */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP server state
 */
interface ServerState {
  store: Store & ControlPlane;
  initialized: boolean;
}

/**
 * Load configuration from file
 */
function loadConfig(configPath: string): SidechainConfig {
  const resolvedPath = path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Configuration file not found: ${resolvedPath}`);
  }

  const configContent = fs.readFileSync(resolvedPath, 'utf-8');
  const config = JSON.parse(configContent) as SidechainConfig;

  return config;
}

/**
 * Handle MCP initialize request
 */
function handleInitialize(
  request: JsonRpcRequest,
  state: ServerState
): JsonRpcResponse {
  state.initialized = true;

  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: 'sidechain-mcp',
        version: '0.1.0',
      },
    },
  };
}

/**
 * Handle MCP tools/list request
 */
function handleToolsList(request: JsonRpcRequest): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: { tools: TOOL_DEFINITIONS },
  };
}

/**
 * Handle MCP tools/call request
 * Routes to Store operations and returns formatted result
 */
async function handleToolCall(
  request: JsonRpcRequest,
  state: ServerState
): Promise<JsonRpcResponse> {
  if (!state.initialized) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32002,
        message: 'Server not initialized',
      },
    };
  }

  const params = request.params as
    | { name: string; arguments?: Record<string, unknown> }
    | undefined;

  if (params === undefined || typeof params.name !== 'string') {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32602,
        message: 'Invalid params: missing tool name',
      },
    };
  }

  const toolName = params.name;
  const args = params.arguments ?? {};

  try {
    const result = await routeToolCall(toolName, args, state.store);

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      },
    };
  } catch (error) {
    // Format error as { ok: false, error, message, ...fields }
    const errorResult = formatError(error);

    // Return error as MCP tool result (not JSON-RPC error)
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResult, null, 2),
          },
        ],
      },
    };
  }
}

/**
 * Process a JSON-RPC request
 */
async function processRequest(
  request: JsonRpcRequest,
  state: ServerState
): Promise<JsonRpcResponse> {
  switch (request.method) {
    case 'initialize':
      return handleInitialize(request, state);

    case 'tools/list':
      return handleToolsList(request);

    case 'tools/call':
      return handleToolCall(request, state);

    default:
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`,
        },
      };
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Get config path from MCP_CONFIG env var or default
    const configPath = process.env['MCP_CONFIG'] ?? DEFAULT_CONFIG_FILE;

    // Load configuration
    const config = loadConfig(configPath);

    // Initialize Store
    const store = await Sidechain.open(config);

    // Create server state
    const state: ServerState = {
      store,
      initialized: false,
    };

    // Set up stdio communication
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // Process each line as a JSON-RPC request
    rl.on('line', (line: string) => {
      void (async () => {
        try {
          const request = JSON.parse(line) as JsonRpcRequest;
          const response = await processRequest(request, state);

          // Write response to stdout
          console.log(JSON.stringify(response));
        } catch (error) {
          // Invalid JSON or processing error
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

          const errorResponse: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: `Parse error: ${errorMessage}`,
            },
          };

          console.log(JSON.stringify(errorResponse));
        }
      })();
    });

    // Handle clean shutdown
    rl.on('close', () => {
      process.exit(0);
    });
  } catch (error) {
    // Fatal initialization error
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    const errorResponse: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: `Internal error: ${errorMessage}`,
      },
    };

    console.log(JSON.stringify(errorResponse));
    process.exit(1);
  }
}

void main();
