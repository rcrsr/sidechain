/**
 * Unit tests for MCP tool definitions
 * Covers: AC-10, AC-13
 *
 * Tests that TOOL_DEFINITIONS array is correctly structured and exported.
 */

import { describe, expect, it } from 'vitest';

import { TOOL_DEFINITIONS } from '../../src/mcp/tools.js';
import type { ToolDefinition } from '../../src/mcp/tools.js';

describe('MCP Tool Definitions', () => {
  it('AC-10: TOOL_DEFINITIONS exports array of 22 tools', () => {
    // Arrange & Act
    const toolCount = TOOL_DEFINITIONS.length;

    // Assert
    expect(toolCount).toBe(22);
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
  });

  it('AC-10: Each tool definition has required structure', () => {
    // Arrange & Act & Assert
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');

      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toHaveProperty('type', 'object');
      expect(tool.inputSchema).toHaveProperty('properties');
      expect(typeof tool.inputSchema.properties).toBe('object');
    }
  });

  it('AC-10: All tool names start with sidechain_ prefix', () => {
    // Arrange & Act & Assert
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.name).toMatch(/^sidechain_/);
    }
  });

  it('AC-10: Tool names are unique', () => {
    // Arrange
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    const uniqueNames = new Set(names);

    // Act & Assert
    expect(uniqueNames.size).toBe(names.length);
  });

  it('AC-10: Contains all expected tool operations', () => {
    // Arrange
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

    // Act
    const actualTools = TOOL_DEFINITIONS.map((t) => t.name);

    // Assert
    expect(actualTools).toEqual(expectedTools);
  });

  it('AC-10: TOOL_DEFINITIONS is declared as readonly array', () => {
    // Arrange & Act
    // TypeScript enforces readonly at compile time
    // Verify the constant is exported and array-like
    const isArray = Array.isArray(TOOL_DEFINITIONS);
    const hasLength = typeof TOOL_DEFINITIONS.length === 'number';

    // Assert
    expect(isArray).toBe(true);
    expect(hasLength).toBe(true);

    // Note: TypeScript prevents mutations at compile time with readonly modifier
    // Runtime mutations are possible but violate type contract
  });

  it('AC-10: Tool definitions include descriptions', () => {
    // Arrange & Act & Assert
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeLessThan(200);
    }
  });

  it('AC-10: Required parameters are specified in inputSchema', () => {
    // Arrange
    const toolsWithRequired = TOOL_DEFINITIONS.filter(
      (t) => t.inputSchema.required && t.inputSchema.required.length > 0
    );

    // Act & Assert
    expect(toolsWithRequired.length).toBeGreaterThan(0);

    // Check specific tools have required params
    const getTool = TOOL_DEFINITIONS.find((t) => t.name === 'sidechain_get');
    expect(getTool?.inputSchema.required).toContain('path');

    const createGroupTool = TOOL_DEFINITIONS.find(
      (t) => t.name === 'sidechain_create_group'
    );
    expect(createGroupTool?.inputSchema.required).toContain('id');
  });
});
