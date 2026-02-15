/**
 * MCP tool router with handler lookup table
 * Covers: IR-9, IC-6
 *
 * Replaces switch statement with handler lookup table.
 * Each handler receives validated args and store, returns operation result.
 */

import type { ControlPlane } from '../types/control-plane.js';
import type { Store } from '../types/store.js';

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  store: Store & ControlPlane
) => Promise<unknown>;

/**
 * sidechain_list handler
 */
async function handleList(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['group'] === 'string') {
    const slots = await store.list(args['group']);
    return { ok: true, slots };
  } else {
    const groups = await store.list();
    return { ok: true, groups };
  }
}

/**
 * sidechain_get handler
 */
async function handleGet(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['path'] !== 'string') {
    throw new Error('Missing required argument: path');
  }
  const node = await store.get(args['path']);
  return { ok: true, ...node };
}

/**
 * sidechain_exists handler
 */
async function handleExists(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['path'] !== 'string') {
    throw new Error('Missing required argument: path');
  }
  const exists = await store.exists(args['path']);
  return { ok: true, exists };
}

/**
 * sidechain_create_group handler
 * Covers: IR-5, IC-6, EC-10, EC-11, AC-6
 */
async function handleCreateGroup(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['id'] !== 'string') {
    throw new Error('Missing required argument: id');
  }

  // Extract client from args or use default 'mcp'
  const client = typeof args['client'] === 'string' ? args['client'] : 'mcp';

  const result = await store.createGroup(args['id'], { client });
  return { ok: true, ...result };
}

/**
 * sidechain_delete_group handler
 */
async function handleDeleteGroup(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['id'] !== 'string') {
    throw new Error('Missing required argument: id');
  }
  const result = await store.deleteGroup(args['id']);
  return result;
}

/**
 * sidechain_describe_group handler
 */
async function handleDescribeGroup(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
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

/**
 * sidechain_validate_group handler
 */
async function handleValidateGroup(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['group'] !== 'string') {
    throw new Error('Missing required argument: group');
  }
  const result = await store.validateGroup(args['group']);
  return { ok: true, ...result };
}

/**
 * sidechain_meta handler
 */
async function handleMeta(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
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

/**
 * sidechain_set_meta handler
 */
async function handleSetMeta(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['path'] !== 'string') {
    throw new Error('Missing required argument: path');
  }

  // Extract token if present
  const token = typeof args['token'] === 'string' ? args['token'] : undefined;
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

/**
 * sidechain_sections handler
 */
async function handleSections(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['path'] !== 'string') {
    throw new Error('Missing required argument: path');
  }
  const sections = await store.sections(args['path']);
  return { ok: true, sections };
}

/**
 * sidechain_section handler
 */
async function handleSection(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['path'] !== 'string') {
    throw new Error('Missing required argument: path');
  }
  if (typeof args['section'] !== 'string') {
    throw new Error('Missing required argument: section');
  }
  const result = await store.section(args['path'], args['section']);
  return { ok: true, ...result };
}

/**
 * sidechain_write_section handler
 */
async function handleWriteSection(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['path'] !== 'string') {
    throw new Error('Missing required argument: path');
  }
  if (typeof args['section'] !== 'string') {
    throw new Error('Missing required argument: section');
  }
  if (args['content'] === undefined) {
    throw new Error('Missing required argument: content');
  }

  const token = typeof args['token'] === 'string' ? args['token'] : undefined;
  const opts = token !== undefined ? { token } : undefined;

  const result = await store.writeSection(
    args['path'],
    args['section'],
    args['content'],
    opts
  );
  return result;
}

/**
 * sidechain_append_section handler
 */
async function handleAppendSection(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['path'] !== 'string') {
    throw new Error('Missing required argument: path');
  }
  if (typeof args['section'] !== 'string') {
    throw new Error('Missing required argument: section');
  }
  if (typeof args['content'] !== 'string') {
    throw new Error('Missing required argument: content');
  }

  const token = typeof args['token'] === 'string' ? args['token'] : undefined;
  const opts = token !== undefined ? { token } : undefined;

  const result = await store.appendSection(
    args['path'],
    args['section'],
    args['content'],
    opts
  );
  return result;
}

/**
 * sidechain_add_section handler
 */
async function handleAddSection(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
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

/**
 * sidechain_remove_section handler
 */
async function handleRemoveSection(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['path'] !== 'string') {
    throw new Error('Missing required argument: path');
  }
  if (typeof args['section'] !== 'string') {
    throw new Error('Missing required argument: section');
  }
  const result = await store.removeSection(args['path'], args['section']);
  return result;
}

/**
 * sidechain_populate handler
 */
async function handlePopulate(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
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

  const token = typeof args['token'] === 'string' ? args['token'] : undefined;
  const opts = token !== undefined ? { token } : undefined;

  const result = await store.populate(args['path'], data, opts);
  return result;
}

/**
 * sidechain_item_get handler
 */
async function handleItemGet(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
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

/**
 * sidechain_item_add handler
 */
async function handleItemAdd(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
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

/**
 * sidechain_item_update handler
 */
async function handleItemUpdate(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
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

  const token = typeof args['token'] === 'string' ? args['token'] : undefined;
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

/**
 * sidechain_item_remove handler
 */
async function handleItemRemove(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
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

/**
 * sidechain_describe handler
 */
async function handleDescribe(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
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

/**
 * sidechain_validate handler
 */
async function handleValidate(
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  if (typeof args['path'] !== 'string') {
    throw new Error('Missing required argument: path');
  }
  const result = await store.validate(args['path']);
  return { ok: true, ...result };
}

/**
 * Tool handler lookup table
 * Maps tool names to handler functions
 * Covers: IR-9
 */
export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  sidechain_list: handleList,
  sidechain_get: handleGet,
  sidechain_exists: handleExists,
  sidechain_create_group: handleCreateGroup,
  sidechain_delete_group: handleDeleteGroup,
  sidechain_describe_group: handleDescribeGroup,
  sidechain_validate_group: handleValidateGroup,
  sidechain_meta: handleMeta,
  sidechain_set_meta: handleSetMeta,
  sidechain_sections: handleSections,
  sidechain_section: handleSection,
  sidechain_write_section: handleWriteSection,
  sidechain_append_section: handleAppendSection,
  sidechain_add_section: handleAddSection,
  sidechain_remove_section: handleRemoveSection,
  sidechain_populate: handlePopulate,
  sidechain_item_get: handleItemGet,
  sidechain_item_add: handleItemAdd,
  sidechain_item_update: handleItemUpdate,
  sidechain_item_remove: handleItemRemove,
  sidechain_describe: handleDescribe,
  sidechain_validate: handleValidate,
};

/**
 * Route tool calls to Store operations
 * Covers: IC-6, AC-11
 *
 * @param toolName - Name of the tool to execute
 * @param args - Tool arguments
 * @param store - Store instance
 * @returns Tool execution result
 * @throws Error with message "Unknown tool: ${toolName}" if tool not found [EC-13]
 */
export async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  store: Store & ControlPlane
): Promise<unknown> {
  const handler = TOOL_HANDLERS[toolName];

  if (handler === undefined) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  return handler(args, store);
}
