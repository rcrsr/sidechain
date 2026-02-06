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

import {
  InvalidSchemaError,
  MappingError,
  NameNotFoundError,
  NotFoundError,
  PatternMismatchError,
  SchemaNotFoundError,
  SectionNotFoundError,
  StaleTokenError,
  ValidationError,
} from '../core/errors.js';
import { Sidechain } from '../core/store.js';
import type { SidechainConfig } from '../types/config.js';
import type { ControlPlane } from '../types/control-plane.js';
import type { Store } from '../types/store.js';

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
      protocolVersion: '2024-11-05',
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
  const tools = [
    {
      name: 'sidechain_list',
      description: 'List all groups or slots within a group',
      inputSchema: {
        type: 'object',
        properties: {
          group: { type: 'string', description: 'Optional group address' },
        },
      },
    },
    {
      name: 'sidechain_get',
      description: 'Get a complete node with metadata and sections',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'sidechain_exists',
      description: 'Check if a path exists',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'sidechain_create_group',
      description: 'Create a new group with specified schema',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Schema ID for the group' },
        },
        required: ['id'],
      },
    },
    {
      name: 'sidechain_delete_group',
      description: 'Delete a group and all its contents',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Group address' },
        },
        required: ['id'],
      },
    },
    {
      name: 'sidechain_describe_group',
      description: "Describe a group's structure (schema and slots)",
      inputSchema: {
        type: 'object',
        properties: {
          schema: { type: 'string', description: 'Schema ID' },
          group: { type: 'string', description: 'Group address' },
        },
      },
    },
    {
      name: 'sidechain_validate_group',
      description: 'Validate all nodes in a group against their schemas',
      inputSchema: {
        type: 'object',
        properties: {
          group: { type: 'string', description: 'Group address' },
        },
        required: ['group'],
      },
    },
    {
      name: 'sidechain_meta',
      description: 'Read metadata fields from a node',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          field: {
            type: 'string',
            description: 'Optional specific field name',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'sidechain_set_meta',
      description: 'Set metadata field(s) on a node',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          field: {
            type: 'string',
            description: 'Field name (for single field)',
          },
          value: { description: 'Field value (for single field)' },
          fields: {
            type: 'object',
            description: 'Multiple fields (alternative to field/value)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'sidechain_sections',
      description: 'List all sections in a node',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'sidechain_section',
      description: 'Read a single section with token',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          section: { type: 'string', description: 'Section ID' },
        },
        required: ['path', 'section'],
      },
    },
    {
      name: 'sidechain_write_section',
      description: "Write/replace a section's content",
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          section: { type: 'string', description: 'Section ID' },
          content: { description: 'Section content' },
        },
        required: ['path', 'section', 'content'],
      },
    },
    {
      name: 'sidechain_append_section',
      description: 'Append content to a section',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          section: { type: 'string', description: 'Section ID' },
          content: { type: 'string', description: 'Content to append' },
        },
        required: ['path', 'section', 'content'],
      },
    },
    {
      name: 'sidechain_add_section',
      description: 'Add a new dynamic section',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          id: { type: 'string', description: 'Section ID' },
          type: { type: 'string', description: 'Section type' },
          after: {
            type: 'string',
            description: 'Optional section to insert after',
          },
        },
        required: ['path', 'id', 'type'],
      },
    },
    {
      name: 'sidechain_remove_section',
      description: 'Remove a section from node',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          section: { type: 'string', description: 'Section ID' },
        },
        required: ['path', 'section'],
      },
    },
    {
      name: 'sidechain_populate',
      description: 'Populate multiple sections atomically',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          metadata: { type: 'object', description: 'Optional metadata fields' },
          sections: { type: 'object', description: 'Section content map' },
        },
        required: ['path'],
      },
    },
    {
      name: 'sidechain_item_get',
      description: 'Get an item from a structured section',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          section: { type: 'string', description: 'Section ID' },
          item: { type: 'string', description: 'Item ID' },
        },
        required: ['path', 'section', 'item'],
      },
    },
    {
      name: 'sidechain_item_add',
      description: 'Add an item to a structured section',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          section: { type: 'string', description: 'Section ID' },
          data: { type: 'object', description: 'Item data' },
        },
        required: ['path', 'section', 'data'],
      },
    },
    {
      name: 'sidechain_item_update',
      description: 'Update an item in a structured section',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          section: { type: 'string', description: 'Section ID' },
          item: { type: 'string', description: 'Item ID' },
          data: { type: 'object', description: 'Updated item data' },
        },
        required: ['path', 'section', 'item', 'data'],
      },
    },
    {
      name: 'sidechain_item_remove',
      description: 'Remove an item from a structured section',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
          section: { type: 'string', description: 'Section ID' },
          item: { type: 'string', description: 'Item ID' },
        },
        required: ['path', 'section', 'item'],
      },
    },
    {
      name: 'sidechain_describe',
      description: "Describe a node's schema structure",
      inputSchema: {
        type: 'object',
        properties: {
          schema: { type: 'string', description: 'Schema ID' },
          path: { type: 'string', description: 'Node path (group/slot)' },
        },
      },
    },
    {
      name: 'sidechain_validate',
      description: 'Validate a node against its schema',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Node path (group/slot)' },
        },
        required: ['path'],
      },
    },
  ];

  return {
    jsonrpc: '2.0',
    id: request.id,
    result: { tools },
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
    let errorResult: {
      ok: false;
      error: string;
      message: string;
      path?: string;
      schema?: string;
      current?: unknown;
      token?: string;
      pattern?: string;
      details?: unknown;
    };

    if (error instanceof ValidationError) {
      errorResult = {
        ok: false,
        error: 'VALIDATION_ERROR',
        path: error.path,
        message: error.message,
      };
      if (error.schema !== undefined) {
        errorResult.schema = error.schema;
      }
    } else if (error instanceof NotFoundError) {
      errorResult = {
        ok: false,
        error: 'NOT_FOUND',
        path: error.path,
        message: error.message,
      };
    } else if (error instanceof SectionNotFoundError) {
      errorResult = {
        ok: false,
        error: 'SECTION_NOT_FOUND',
        path: error.path,
        message: error.message,
      };
    } else if (error instanceof StaleTokenError) {
      errorResult = {
        ok: false,
        error: 'STALE_TOKEN',
        path: error.path,
        message: error.message,
        current: error.current,
        token: error.token,
      };
    } else if (error instanceof PatternMismatchError) {
      errorResult = {
        ok: false,
        error: 'PATTERN_MISMATCH',
        path: error.path,
        pattern: error.pattern,
        message: error.message,
      };
    } else if (error instanceof SchemaNotFoundError) {
      errorResult = {
        ok: false,
        error: 'SCHEMA_NOT_FOUND',
        schema: error.schema,
        message: error.message,
      };
    } else if (error instanceof InvalidSchemaError) {
      errorResult = {
        ok: false,
        error: 'INVALID_SCHEMA',
        message: error.message,
      };
      if (error.details !== undefined) {
        errorResult.details = error.details;
      }
    } else if (error instanceof NameNotFoundError) {
      errorResult = {
        ok: false,
        error: 'NAME_NOT_FOUND',
        message: error.message,
      };
    } else if (error instanceof MappingError) {
      errorResult = {
        ok: false,
        error: 'MAPPING_ERROR',
        message: error.message,
      };
    } else if (error instanceof Error) {
      errorResult = {
        ok: false,
        error: 'INTERNAL_ERROR',
        message: error.message,
      };
    } else {
      errorResult = {
        ok: false,
        error: 'INTERNAL_ERROR',
        message: 'An unknown error occurred',
      };
    }

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
 * Route tool calls to Store operations
 * Covers: IC-13
 */
async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  switch (toolName) {
    case 'sidechain_list': {
      if (typeof args['group'] === 'string') {
        const slots = await store.list(args['group']);
        return { ok: true, slots };
      } else {
        const groups = await store.list();
        return { ok: true, groups };
      }
    }

    case 'sidechain_get': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      const node = await store.get(args['path']);
      return { ok: true, ...node };
    }

    case 'sidechain_exists': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      const exists = await store.exists(args['path']);
      return { ok: true, exists };
    }

    case 'sidechain_create_group': {
      if (typeof args['id'] !== 'string') {
        throw new Error('Missing required argument: id');
      }
      const result = await store.createGroup(args['id']);
      return { ok: true, ...result };
    }

    case 'sidechain_delete_group': {
      if (typeof args['id'] !== 'string') {
        throw new Error('Missing required argument: id');
      }
      const result = await store.deleteGroup(args['id']);
      return result;
    }

    case 'sidechain_describe_group': {
      // Handle parameter variants: { schema } | { group }
      if (typeof args['schema'] === 'string') {
        // Describe schema structure
        const schema = await store.getSchema(args['schema']);
        return { ok: true, schema };
      } else if (typeof args['group'] === 'string') {
        // Describe group instance
        const description = await store.describeGroup(args['group']);
        return { ok: true, ...description };
      } else {
        throw new Error('Missing required argument: schema or group');
      }
    }

    case 'sidechain_validate_group': {
      if (typeof args['group'] !== 'string') {
        throw new Error('Missing required argument: group');
      }
      const result = await store.validateGroup(args['group']);
      return { ok: true, ...result };
    }

    case 'sidechain_meta': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      if (typeof args['field'] === 'string') {
        // Read single field
        const result = await store.meta(args['path'], args['field']);
        return { ok: true, ...result };
      } else {
        // Read all metadata
        const result = await store.meta(args['path']);
        return { ok: true, ...result };
      }
    }

    case 'sidechain_set_meta': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }

      // Extract token if present
      const token =
        typeof args['token'] === 'string' ? args['token'] : undefined;
      const opts = token !== undefined ? { token } : undefined;

      // Handle overload: { field, value } vs { fields }
      if (typeof args['field'] === 'string' && args['value'] !== undefined) {
        // Single field variant
        const result = await store.setMeta(
          args['path'],
          args['field'],
          args['value'],
          opts
        );
        return result;
      } else if (
        typeof args['fields'] === 'object' &&
        args['fields'] !== null &&
        !Array.isArray(args['fields'])
      ) {
        // Multiple fields variant
        const result = await store.setMeta(
          args['path'],
          args['fields'] as Record<string, unknown>,
          opts
        );
        return result;
      } else {
        throw new Error('Missing required argument: field+value or fields');
      }
    }

    case 'sidechain_sections': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      const sections = await store.sections(args['path']);
      return { ok: true, sections };
    }

    case 'sidechain_section': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      if (typeof args['section'] !== 'string') {
        throw new Error('Missing required argument: section');
      }
      const result = await store.section(args['path'], args['section']);
      return { ok: true, ...result };
    }

    case 'sidechain_write_section': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      if (typeof args['section'] !== 'string') {
        throw new Error('Missing required argument: section');
      }
      if (args['content'] === undefined) {
        throw new Error('Missing required argument: content');
      }

      const token =
        typeof args['token'] === 'string' ? args['token'] : undefined;
      const opts = token !== undefined ? { token } : undefined;

      const result = await store.writeSection(
        args['path'],
        args['section'],
        args['content'],
        opts
      );
      return result;
    }

    case 'sidechain_append_section': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      if (typeof args['section'] !== 'string') {
        throw new Error('Missing required argument: section');
      }
      if (typeof args['content'] !== 'string') {
        throw new Error('Missing required argument: content');
      }

      const token =
        typeof args['token'] === 'string' ? args['token'] : undefined;
      const opts = token !== undefined ? { token } : undefined;

      const result = await store.appendSection(
        args['path'],
        args['section'],
        args['content'],
        opts
      );
      return result;
    }

    case 'sidechain_add_section': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      if (typeof args['id'] !== 'string') {
        throw new Error('Missing required argument: id');
      }
      if (typeof args['type'] !== 'string') {
        throw new Error('Missing required argument: type');
      }

      const def: { id: string; type: string; after?: string } = {
        id: args['id'],
        type: args['type'],
      };

      if (typeof args['after'] === 'string') {
        def.after = args['after'];
      }

      const result = await store.addSection(args['path'], def);
      return result;
    }

    case 'sidechain_remove_section': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      if (typeof args['section'] !== 'string') {
        throw new Error('Missing required argument: section');
      }
      const result = await store.removeSection(args['path'], args['section']);
      return result;
    }

    case 'sidechain_populate': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }

      // PopulateData requires sections field (can be empty object)
      const data: {
        metadata?: Record<string, unknown>;
        sections: Record<string, unknown>;
      } = {
        sections: {},
      };

      if (
        typeof args['metadata'] === 'object' &&
        args['metadata'] !== null &&
        !Array.isArray(args['metadata'])
      ) {
        data.metadata = args['metadata'] as Record<string, unknown>;
      }

      if (
        typeof args['sections'] === 'object' &&
        args['sections'] !== null &&
        !Array.isArray(args['sections'])
      ) {
        data.sections = args['sections'] as Record<string, unknown>;
      }

      const token =
        typeof args['token'] === 'string' ? args['token'] : undefined;
      const opts = token !== undefined ? { token } : undefined;

      const result = await store.populate(args['path'], data, opts);
      return result;
    }

    case 'sidechain_item_get': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      if (typeof args['section'] !== 'string') {
        throw new Error('Missing required argument: section');
      }
      if (typeof args['item'] !== 'string') {
        throw new Error('Missing required argument: item');
      }
      const result = await store.item.get(
        args['path'],
        args['section'],
        args['item']
      );
      return { ok: true, ...result };
    }

    case 'sidechain_item_add': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      if (typeof args['section'] !== 'string') {
        throw new Error('Missing required argument: section');
      }
      if (
        typeof args['data'] !== 'object' ||
        args['data'] === null ||
        Array.isArray(args['data'])
      ) {
        throw new Error('Missing required argument: data (must be object)');
      }
      const result = await store.item.add(
        args['path'],
        args['section'],
        args['data'] as Record<string, unknown>
      );
      return result;
    }

    case 'sidechain_item_update': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      if (typeof args['section'] !== 'string') {
        throw new Error('Missing required argument: section');
      }
      if (typeof args['item'] !== 'string') {
        throw new Error('Missing required argument: item');
      }
      if (
        typeof args['data'] !== 'object' ||
        args['data'] === null ||
        Array.isArray(args['data'])
      ) {
        throw new Error('Missing required argument: data (must be object)');
      }

      const token =
        typeof args['token'] === 'string' ? args['token'] : undefined;
      const opts = token !== undefined ? { token } : undefined;

      const result = await store.item.update(
        args['path'],
        args['section'],
        args['item'],
        args['data'] as Record<string, unknown>,
        opts
      );
      return result;
    }

    case 'sidechain_item_remove': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      if (typeof args['section'] !== 'string') {
        throw new Error('Missing required argument: section');
      }
      if (typeof args['item'] !== 'string') {
        throw new Error('Missing required argument: item');
      }
      const result = await store.item.remove(
        args['path'],
        args['section'],
        args['item']
      );
      return result;
    }

    case 'sidechain_describe': {
      // Handle parameter variants: { schema } | { path }
      if (typeof args['schema'] === 'string') {
        // Describe schema by ID
        const description = await store.describe(args['schema']);
        return { ok: true, ...description };
      } else if (typeof args['path'] === 'string') {
        // Describe node by path
        const description = await store.describe(args['path']);
        return { ok: true, ...description };
      } else {
        throw new Error('Missing required argument: schema or path');
      }
    }

    case 'sidechain_validate': {
      if (typeof args['path'] !== 'string') {
        throw new Error('Missing required argument: path');
      }
      const result = await store.validate(args['path']);
      return { ok: true, ...result };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
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
    const configPath = process.env['MCP_CONFIG'] ?? 'sidechain.json';

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
