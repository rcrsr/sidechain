/**
 * MCP Tool Definitions
 * Covers: IR-8, IC-5
 *
 * Static array of MCP tool definitions for Sidechain Store operations.
 * Each tool follows MCP tool format with name, description, and inputSchema.
 */

/**
 * MCP tool definition structure
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: readonly string[];
  };
}

/**
 * Array of all MCP tools exposed by Sidechain
 * Total count: 22 tools
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
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
