/**
 * Integration tests for MCP server entry point
 * Covers: IC-13
 *
 * Tests MCP server initialization, tool registration, and basic routing.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GroupSchema, NodeSchema } from '../../src/types/schema.js';

describe('MCP Server Entry Point', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
    configPath = path.join(tempDir, 'sidechain.json');

    const groupSchema: GroupSchema = {
      'schema-id': 'test-group',
      slots: [
        { id: 'requirements', schema: 'test-node' },
        { id: 'plan', schema: 'test-node' },
      ],
    };

    const nodeSchema: NodeSchema = {
      'schema-id': 'test-node',
      metadata: {
        required: ['schema-id'],
        fields: {
          'schema-id': { type: 'string' },
          status: {
            type: 'enum',
            values: ['draft', 'locked'],
          },
        },
      },
      sections: {
        required: [{ id: 'overview', type: 'text' }],
        optional: [],
      },
    };

    const config = {
      groupSchemas: {
        'test-group': groupSchema,
      },
      nodeSchemas: {
        'test-node': nodeSchema,
      },
      mounts: {
        main: { path: tempDir, groupSchema: 'test-group' },
      },
      nodeExtension: '.md',
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('AC-IC-13: MCP server starts and responds to initialize', async () => {
    const serverPath = path.resolve(__dirname, '../../dist/mcp/index.js');

    const server = spawn('node', [serverPath], {
      env: { ...process.env, MCP_CONFIG: configPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output: string[] = [];
    const errors: string[] = [];

    server.stdout.on('data', (data: Buffer) => {
      output.push(data.toString());
    });

    server.stderr.on('data', (data: Buffer) => {
      errors.push(data.toString());
    });

    // Send initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };

    server.stdin.write(JSON.stringify(initRequest) + '\n');

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 500));

    server.kill();

    expect(errors.length).toBe(0);
    expect(output.length).toBeGreaterThan(0);

    const response = JSON.parse(output[0] ?? '{}');
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'sidechain-mcp', version: '0.1.0' },
      },
    });
  });

  it('AC-IC-13: MCP server registers all 22 tools', async () => {
    const serverPath = path.resolve(__dirname, '../../dist/mcp/index.js');

    const server = spawn('node', [serverPath], {
      env: { ...process.env, MCP_CONFIG: configPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output: string[] = [];

    server.stdout.on('data', (data: Buffer) => {
      output.push(data.toString());
    });

    // Send initialize first
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    };

    server.stdin.write(JSON.stringify(initRequest) + '\n');

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send tools/list request
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    };

    server.stdin.write(JSON.stringify(toolsRequest) + '\n');

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 500));

    server.kill();

    expect(output.length).toBeGreaterThan(1);

    const toolsResponse = JSON.parse(output[1] ?? '{}');
    expect(toolsResponse).toHaveProperty('result.tools');

    const tools = toolsResponse.result.tools as unknown[];
    expect(tools).toHaveLength(22);

    const expectedTools = [
      'sidechain_list',
      'sidechain_get',
      'sidechain_exists',
      'sidechain_create_group',
      'sidechain_delete_group',
      'sidechain_describe_group',
      'sidechain_validate_group',
      'sidechain_meta',
      'sidechain_set_meta',
      'sidechain_sections',
      'sidechain_section',
      'sidechain_write_section',
      'sidechain_append_section',
      'sidechain_add_section',
      'sidechain_remove_section',
      'sidechain_populate',
      'sidechain_item_get',
      'sidechain_item_add',
      'sidechain_item_update',
      'sidechain_item_remove',
      'sidechain_describe',
      'sidechain_validate',
    ];

    const toolNames = tools.map((t: unknown) => (t as { name: string }).name);
    expect(toolNames).toEqual(expectedTools);
  });

  it('AC-IC-13: Tool calls route to Store operations correctly', async () => {
    const serverPath = path.resolve(__dirname, '../../dist/mcp/index.js');

    const server = spawn('node', [serverPath], {
      env: { ...process.env, MCP_CONFIG: configPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output: string[] = [];

    server.stdout.on('data', (data: Buffer) => {
      output.push(data.toString());
    });

    // Send initialize
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    };

    server.stdin.write(JSON.stringify(initRequest) + '\n');

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Call sidechain_list tool
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'sidechain_list',
        arguments: {},
      },
    };

    server.stdin.write(JSON.stringify(toolCallRequest) + '\n');

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 500));

    server.kill();

    expect(output.length).toBeGreaterThan(1);

    const toolCallResponse = JSON.parse(output[1] ?? '{}');
    expect(toolCallResponse).toHaveProperty('result.content');

    const content = toolCallResponse.result.content as Array<{
      type: string;
      text: string;
    }>;
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe('text');

    const result = JSON.parse(content[0]?.text ?? '{}');
    expect(result).toMatchObject({
      ok: true,
      groups: [],
    });
  });

  it('EC-1, EC-10: NOT_FOUND error formatted with ok:false, error, path, message', async () => {
    const serverPath = path.resolve(__dirname, '../../dist/mcp/index.js');

    const server = spawn('node', [serverPath], {
      env: { ...process.env, MCP_CONFIG: configPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output: string[] = [];

    server.stdout.on('data', (data: Buffer) => {
      output.push(data.toString());
    });

    // Initialize
    server.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Call get on non-existent path
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'sidechain_get',
        arguments: { path: 'nonexistent/slot' },
      },
    };

    server.stdin.write(JSON.stringify(toolCallRequest) + '\n');
    await new Promise((resolve) => setTimeout(resolve, 500));

    server.kill();

    const toolCallResponse = JSON.parse(output[1] ?? '{}');
    const content = toolCallResponse.result.content as Array<{
      type: string;
      text: string;
    }>;
    const result = JSON.parse(content[0]?.text ?? '{}');

    expect(result).toMatchObject({
      ok: false,
      error: 'NOT_FOUND',
      path: 'nonexistent/slot',
      message: expect.any(String),
    });
  });

  it('EC-2, EC-9: VALIDATION_ERROR formatted with ok:false, error, path, message, schema', async () => {
    const serverPath = path.resolve(__dirname, '../../dist/mcp/index.js');

    const server = spawn('node', [serverPath], {
      env: { ...process.env, MCP_CONFIG: configPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses: string[] = [];

    server.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      responses.push(...lines);
    });

    // Initialize
    server.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create group first
    server.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'sidechain_create_group',
          arguments: { id: 'test-group' },
        },
      }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Find create group response
    const createResponse = responses.find((r) => {
      try {
        const parsed = JSON.parse(r);
        return parsed.id === 2;
      } catch {
        return false;
      }
    });
    const createParsed = JSON.parse(createResponse ?? '{}');
    const createContent = createParsed.result?.content as Array<{
      text: string;
    }>;
    const createResult = JSON.parse(createContent?.[0]?.text ?? '{}');
    const groupAddress = createResult.address as string;

    // Try to set invalid enum value
    server.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'sidechain_set_meta',
          arguments: {
            path: `${groupAddress}/requirements`,
            field: 'status',
            value: 'invalid-status',
          },
        },
      }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    server.kill();

    // Find error response
    const errorResponseStr = responses.find((r) => {
      try {
        const parsed = JSON.parse(r);
        return parsed.id === 3;
      } catch {
        return false;
      }
    });
    const errorResponse = JSON.parse(errorResponseStr ?? '{}');
    const content = errorResponse.result?.content as Array<{ text: string }>;
    const result = JSON.parse(content?.[0]?.text ?? '{}');

    expect(result).toMatchObject({
      ok: false,
      error: 'VALIDATION_ERROR',
      path: expect.stringContaining('/requirements'),
      message: expect.any(String),
    });
  });

  it('EC-11: SECTION_NOT_FOUND formatted with ok:false, error, path, message', async () => {
    const serverPath = path.resolve(__dirname, '../../dist/mcp/index.js');

    const server = spawn('node', [serverPath], {
      env: { ...process.env, MCP_CONFIG: configPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses: string[] = [];

    server.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      responses.push(...lines);
    });

    // Initialize
    server.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create group
    server.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'sidechain_create_group',
          arguments: { id: 'test-group' },
        },
      }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    const createResponse = responses.find((r) => {
      try {
        const parsed = JSON.parse(r);
        return parsed.id === 2;
      } catch {
        return false;
      }
    });
    const createParsed = JSON.parse(createResponse ?? '{}');
    const createContent = createParsed.result?.content as Array<{
      text: string;
    }>;
    const createResult = JSON.parse(createContent?.[0]?.text ?? '{}');
    const groupAddress = createResult.address as string;

    // Try to read non-existent section
    server.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'sidechain_section',
          arguments: {
            path: `${groupAddress}/requirements`,
            section: 'nonexistent',
          },
        },
      }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    server.kill();

    const errorResponseStr = responses.find((r) => {
      try {
        const parsed = JSON.parse(r);
        return parsed.id === 3;
      } catch {
        return false;
      }
    });
    const errorResponse = JSON.parse(errorResponseStr ?? '{}');
    const content = errorResponse.result?.content as Array<{ text: string }>;
    const result = JSON.parse(content?.[0]?.text ?? '{}');

    expect(result).toMatchObject({
      ok: false,
      error: 'SECTION_NOT_FOUND',
      path: expect.stringContaining('/requirements'),
      message: expect.any(String),
    });
  });

  it('EC-12: STALE_TOKEN formatted with ok:false, error, path, message, current, token', async () => {
    const serverPath = path.resolve(__dirname, '../../dist/mcp/index.js');

    const server = spawn('node', [serverPath], {
      env: { ...process.env, MCP_CONFIG: configPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses: string[] = [];

    server.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      responses.push(...lines);
    });

    // Initialize
    server.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create group
    server.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'sidechain_create_group',
          arguments: { id: 'test-group' },
        },
      }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    const createResponse = responses.find((r) => {
      try {
        const parsed = JSON.parse(r);
        return parsed.id === 2;
      } catch {
        return false;
      }
    });
    const createParsed = JSON.parse(createResponse ?? '{}');
    const createContent = createParsed.result?.content as Array<{
      text: string;
    }>;
    const createResult = JSON.parse(createContent?.[0]?.text ?? '{}');
    const groupAddress = createResult.address as string;

    // Try to write with invalid token
    server.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'sidechain_set_meta',
          arguments: {
            path: `${groupAddress}/requirements`,
            field: 'status',
            value: 'draft',
            token: 'invalid-token-12345',
          },
        },
      }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    server.kill();

    const errorResponseStr = responses.find((r) => {
      try {
        const parsed = JSON.parse(r);
        return parsed.id === 3;
      } catch {
        return false;
      }
    });
    const errorResponse = JSON.parse(errorResponseStr ?? '{}');
    const content = errorResponse.result?.content as Array<{ text: string }>;
    const result = JSON.parse(content?.[0]?.text ?? '{}');

    expect(result).toMatchObject({
      ok: false,
      error: 'STALE_TOKEN',
      path: expect.stringContaining('/requirements'),
      message: expect.any(String),
      current: expect.any(Object),
      token: expect.any(String),
    });
  });

  it('EC-13: PATTERN_MISMATCH formatted with ok:false, error, path, pattern, message', async () => {
    const serverPath = path.resolve(__dirname, '../../dist/mcp/index.js');

    // Update config to have dynamic sections with pattern
    const groupSchema: GroupSchema = {
      'schema-id': 'test-group-dynamic',
      slots: [{ id: 'plan', schema: 'test-node-dynamic' }],
    };

    const nodeSchema: NodeSchema = {
      'schema-id': 'test-node-dynamic',
      metadata: {
        required: ['schema-id'],
        fields: {
          'schema-id': { type: 'string' },
        },
      },
      sections: {
        required: [],
        optional: [],
        dynamic: [
          {
            'id-pattern': '^phase-\\d+$',
            type: 'task-list',
            description: 'Project phases',
          },
        ],
      },
    };

    const config = {
      groupSchemas: {
        'test-group-dynamic': groupSchema,
      },
      nodeSchemas: {
        'test-node-dynamic': nodeSchema,
      },
      mounts: {
        main: { path: tempDir, groupSchema: 'test-group-dynamic' },
      },
      nodeExtension: '.md',
    };

    const dynamicConfigPath = path.join(tempDir, 'dynamic-sidechain.json');
    await fs.writeFile(dynamicConfigPath, JSON.stringify(config, null, 2));

    const dynamicServer = spawn('node', [serverPath], {
      env: { ...process.env, MCP_CONFIG: dynamicConfigPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses: string[] = [];

    dynamicServer.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      responses.push(...lines);
    });

    // Initialize
    dynamicServer.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create group
    dynamicServer.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'sidechain_create_group',
          arguments: { id: 'test-group-dynamic' },
        },
      }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    const createResponse = responses.find((r) => {
      try {
        const parsed = JSON.parse(r);
        return parsed.id === 2;
      } catch {
        return false;
      }
    });
    const createParsed = JSON.parse(createResponse ?? '{}');
    const createContent = createParsed.result?.content as Array<{
      text: string;
    }>;
    const createResult = JSON.parse(createContent?.[0]?.text ?? '{}');
    const groupAddress = createResult.address as string;

    // Try to add section with invalid pattern
    dynamicServer.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'sidechain_add_section',
          arguments: {
            path: `${groupAddress}/plan`,
            id: 'invalid-section',
            type: 'task-list',
          },
        },
      }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    dynamicServer.kill();

    const errorResponseStr = responses.find((r) => {
      try {
        const parsed = JSON.parse(r);
        return parsed.id === 3;
      } catch {
        return false;
      }
    });
    const errorResponse = JSON.parse(errorResponseStr ?? '{}');
    const content = errorResponse.result?.content as Array<{ text: string }>;
    const result = JSON.parse(content?.[0]?.text ?? '{}');

    expect(result).toMatchObject({
      ok: false,
      error: 'PATTERN_MISMATCH',
      path: expect.stringContaining('/plan'),
      pattern: '^phase-\\d+$',
      message: expect.any(String),
    });
  });
});
