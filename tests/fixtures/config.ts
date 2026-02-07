/**
 * Shared test configuration builders
 * Reduces duplication of schema and config definitions across test files
 */

import type { SidechainConfig } from '../../src/types/config.js';
import type { GroupSchema, NodeSchema } from '../../src/types/schema.js';

/**
 * Create a minimal node schema for testing
 */
export function createTestNodeSchema(): NodeSchema {
  return {
    'schema-id': 'test-node',
  };
}

/**
 * Create a node schema with metadata fields
 */
export function createTestNodeSchemaWithMetadata(): NodeSchema {
  return {
    'schema-id': 'test-node',
    metadata: {
      fields: {
        status: {
          type: 'enum',
          values: ['draft', 'in-progress', 'completed'],
          required: true,
          description: 'Current status of the node',
        },
        priority: {
          type: 'enum',
          values: ['low', 'medium', 'high'],
          description: 'Priority level',
        },
        assignee: {
          type: 'string',
          description: 'Assigned person',
        },
        dueDate: {
          type: 'date',
          description: 'Due date in YYYY-MM-DD format',
        },
        tags: {
          type: 'string[]',
          description: 'Tags for categorization',
        },
      },
    },
    sections: {
      required: [{ id: 'overview', type: 'text' }],
    },
  };
}

/**
 * Create a plan node schema with sections and metadata
 */
export function createTestPlanSchema(): NodeSchema {
  return {
    'schema-id': 'test-plan',
    metadata: {
      fields: {
        status: {
          type: 'enum',
          values: ['draft', 'locked'],
          required: true,
          description: 'Plan status',
        },
        blocks: {
          type: 'string[]',
          description: 'Dependency paths',
        },
      },
    },
    sections: {
      required: [{ id: 'overview', type: 'text' }],
      optional: [{ id: 'notes', type: 'text' }],
      dynamic: [{ 'id-pattern': 'phase-{n}', type: 'task-list', min: 1 }],
    },
  };
}

/**
 * Create a test group schema
 */
export function createTestGroupSchema(
  slots: Array<{ id: string; schema: string }>
): GroupSchema {
  return {
    'schema-id': 'test-group',
    slots,
  };
}

/**
 * Create a minimal sidechain config for testing
 * @param tempDir - Temporary directory for test files
 * @param options - Optional overrides
 */
export function createTestConfig(
  tempDir: string,
  options: {
    groupSchemaId?: string;
    nodeSchemaId?: string;
    slots?: Array<{ id: string; schema: string }>;
    nodeSchema?: NodeSchema;
  } = {}
): SidechainConfig {
  const groupSchemaId = options.groupSchemaId ?? 'test-group';
  const nodeSchemaId = options.nodeSchemaId ?? 'test-node';
  const slots = options.slots ?? [
    { id: 'requirements', schema: nodeSchemaId },
    { id: 'plan', schema: nodeSchemaId },
  ];
  const nodeSchema = options.nodeSchema ?? createTestNodeSchema();

  return {
    mounts: {
      main: {
        path: `${tempDir}/groups`,
        groupSchema: groupSchemaId,
      },
    },
    groupSchemas: {
      [groupSchemaId]: {
        'schema-id': groupSchemaId,
        slots,
      },
    },
    nodeSchemas: {
      [nodeSchemaId]: {
        ...nodeSchema,
        'schema-id': nodeSchemaId,
      },
    },
  };
}

/**
 * Create a config with metadata support
 */
export function createTestConfigWithMetadata(tempDir: string): SidechainConfig {
  return createTestConfig(tempDir, {
    nodeSchema: createTestNodeSchemaWithMetadata(),
  });
}

/**
 * Create a config with plan schema (sections + metadata)
 */
export function createTestConfigWithPlan(tempDir: string): SidechainConfig {
  return createTestConfig(tempDir, {
    nodeSchemaId: 'test-plan',
    slots: [{ id: 'plan', schema: 'test-plan' }],
    nodeSchema: createTestPlanSchema(),
  });
}

/**
 * Create a config with multiple node schemas
 */
export function createTestConfigMultiSchema(
  tempDir: string,
  schemas: Record<string, NodeSchema>
): SidechainConfig {
  const slots = Object.keys(schemas).map((schemaId) => ({
    id: schemaId,
    schema: schemaId,
  }));

  return {
    mounts: {
      main: {
        path: `${tempDir}/groups`,
        groupSchema: 'test-group',
      },
    },
    groupSchemas: {
      'test-group': {
        'schema-id': 'test-group',
        slots,
      },
    },
    nodeSchemas: schemas,
  };
}
