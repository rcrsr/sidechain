/**
 * Integration tests for MCP tool definitions import
 * Covers: AC-13
 *
 * Tests that handleToolsList correctly imports and returns TOOL_DEFINITIONS.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GroupSchema, NodeSchema } from '../../src/types/schema.js';
import { TOOL_DEFINITIONS } from '../../src/mcp/tools.js';

describe('MCP handleToolsList Integration', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-tools-test-'));
    configPath = path.join(tempDir, 'sidechain.json');

    const groupSchema: GroupSchema = {
      'schema-id': 'test-group',
      slots: [{ id: 'requirements', schema: 'test-node' }],
    };

    const nodeSchema: NodeSchema = {
      'schema-id': 'test-node',
      metadata: {
        required: ['schema-id'],
        fields: {
          'schema-id': { type: 'string' },
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

  it('AC-13: handleToolsList returns imported TOOL_DEFINITIONS', async () => {
    // Arrange
    const serverPath = path.resolve(__dirname, '../../dist/mcp/index.js');

    const server = spawn('node', [serverPath], {
      env: { ...process.env, MCP_CONFIG: configPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output: string[] = [];

    server.stdout.on('data', (data: Buffer) => {
      output.push(data.toString());
    });

    // Act
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
    await new Promise((resolve) => setTimeout(resolve, 500));

    server.kill();

    // Assert
    expect(output.length).toBeGreaterThan(1);

    const toolsResponse = JSON.parse(output[1] ?? '{}');
    expect(toolsResponse).toHaveProperty('result.tools');

    const returnedTools = toolsResponse.result.tools as unknown[];

    // Verify exact match with TOOL_DEFINITIONS
    expect(returnedTools.length).toBe(TOOL_DEFINITIONS.length);

    for (let i = 0; i < TOOL_DEFINITIONS.length; i++) {
      const expected = TOOL_DEFINITIONS[i];
      const actual = returnedTools[i] as {
        name: string;
        description: string;
        inputSchema: unknown;
      };

      expect(actual.name).toBe(expected?.name);
      expect(actual.description).toBe(expected?.description);
      expect(actual.inputSchema).toEqual(expected?.inputSchema);
    }
  });

  it('AC-13: Tool definitions match between module and server response', async () => {
    // Arrange
    const serverPath = path.resolve(__dirname, '../../dist/mcp/index.js');

    const server = spawn('node', [serverPath], {
      env: { ...process.env, MCP_CONFIG: configPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const output: string[] = [];

    server.stdout.on('data', (data: Buffer) => {
      output.push(data.toString());
    });

    // Act
    server.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    server.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n'
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    server.kill();

    // Assert
    const toolsResponse = JSON.parse(output[1] ?? '{}');
    const returnedToolNames = (
      toolsResponse.result.tools as Array<{ name: string }>
    ).map((t) => t.name);

    const definedToolNames = TOOL_DEFINITIONS.map((t) => t.name);

    expect(returnedToolNames).toEqual(definedToolNames);
  });
});
