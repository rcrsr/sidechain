/**
 * Tests for schema registry and validation logic
 * Covers: IR-35, IR-36, IR-37, EC-6, EC-7, EC-8, EC-9, EC-13, AC-3, AC-13, AC-14, AC-16, AC-17, AC-19, AC-20, IC-5
 */

import { describe, expect, it } from 'vitest';

import {
  InvalidSchemaError,
  PatternMismatchError,
  SchemaNotFoundError,
  ValidationError,
} from '../../src/core/errors.js';
import {
  checkSchemaDrift,
  matchDynamicPattern,
  SchemaRegistry,
  validateDynamicSectionId,
  validateDynamicSectionMin,
  validateMetadata,
  validateMetadataField,
} from '../../src/core/schema.js';
import type {
  DynamicSectionDef,
  FieldDef,
  NodeSchema,
} from '../../src/types/schema.js';

describe('SchemaRegistry', () => {
  describe('registerSchema', () => {
    // IR-37: registerSchema stores valid definition
    it('stores valid node schema definition', () => {
      const registry = new SchemaRegistry();
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        version: '1.0',
        description: 'Test schema',
        metadata: {
          fields: {
            status: {
              type: 'enum',
              values: ['draft', 'locked'],
              required: true,
              description: 'Status field',
            },
          },
        },
        sections: {
          required: [{ id: 'overview', type: 'text' }],
        },
      };

      registry.registerSchema(schema);

      const retrieved = registry.getSchema('test-schema');
      expect(retrieved).toEqual(schema);
    });

    // AC-3: Registered schemas accessible via getSchema
    it('makes registered schemas accessible', () => {
      const registry = new SchemaRegistry();
      const schema: NodeSchema = {
        'schema-id': 'accessible-schema',
      };

      registry.registerSchema(schema);

      expect(() => registry.getSchema('accessible-schema')).not.toThrow();
      expect(registry.getSchema('accessible-schema')).toEqual(schema);
    });

    // EC-7: Schema definition malformed
    it('throws INVALID_SCHEMA when schema-id missing', () => {
      const registry = new SchemaRegistry();
      const schema = {} as NodeSchema;

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
      expect(() => registry.registerSchema(schema)).toThrow(
        /Schema missing required field: schema-id/
      );
    });

    // EC-7: Schema definition malformed - empty schema-id
    it('throws INVALID_SCHEMA when schema-id is empty string', () => {
      const registry = new SchemaRegistry();
      const schema = { 'schema-id': '' } as NodeSchema;

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
    });

    // EC-7: Invalid version type
    it('throws INVALID_SCHEMA when version is not string', () => {
      const registry = new SchemaRegistry();
      const schema = {
        'schema-id': 'test',
        version: 123,
      } as unknown as NodeSchema;

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
      expect(() => registry.registerSchema(schema)).toThrow(
        /Invalid version type/
      );
    });

    // EC-7: Invalid description type
    it('throws INVALID_SCHEMA when description is not string', () => {
      const registry = new SchemaRegistry();
      const schema = {
        'schema-id': 'test',
        description: 123,
      } as unknown as NodeSchema;

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
      expect(() => registry.registerSchema(schema)).toThrow(
        /Invalid description type/
      );
    });

    // EC-7: Invalid field type
    it('throws INVALID_SCHEMA when field has invalid type', () => {
      const registry = new SchemaRegistry();
      const schema: NodeSchema = {
        'schema-id': 'test',
        metadata: {
          fields: {
            status: {
              type: 'invalid' as never,
            },
          },
        },
      };

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
      expect(() => registry.registerSchema(schema)).toThrow(
        /Invalid field type/
      );
    });

    // EC-7: Enum without values
    it('throws INVALID_SCHEMA when enum field missing values array', () => {
      const registry = new SchemaRegistry();
      const schema: NodeSchema = {
        'schema-id': 'test',
        metadata: {
          fields: {
            status: {
              type: 'enum',
            },
          },
        },
      };

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
      expect(() => registry.registerSchema(schema)).toThrow(
        /must have non-empty 'values' array/
      );
    });

    // EC-7: Enum with empty values
    it('throws INVALID_SCHEMA when enum values array is empty', () => {
      const registry = new SchemaRegistry();
      const schema: NodeSchema = {
        'schema-id': 'test',
        metadata: {
          fields: {
            status: {
              type: 'enum',
              values: [],
            },
          },
        },
      };

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
    });

    // EC-8: Schema ID already registered with different definition
    it('throws VALIDATION_ERROR when registering duplicate ID with different definition', () => {
      const registry = new SchemaRegistry();
      const schema1: NodeSchema = {
        'schema-id': 'test-schema',
        version: '1.0',
      };
      const schema2: NodeSchema = {
        'schema-id': 'test-schema',
        version: '2.0',
      };

      registry.registerSchema(schema1);

      expect(() => registry.registerSchema(schema2)).toThrow(ValidationError);
      expect(() => registry.registerSchema(schema2)).toThrow(
        /already registered with different definition/
      );
    });

    // EC-8: Allow re-registration with same definition
    it('allows re-registration with identical definition', () => {
      const registry = new SchemaRegistry();
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        version: '1.0',
      };

      registry.registerSchema(schema);
      registry.registerSchema(schema);

      expect(registry.listSchemas()).toEqual(['test-schema']);
    });

    // Group schema validation
    it('validates group schema with slots', () => {
      const registry = new SchemaRegistry();
      const schema = {
        'schema-id': 'test-group',
        slots: [
          { id: 'requirements', schema: 'requirement-schema' },
          { id: 'plan', schema: 'plan-schema' },
        ],
      };

      registry.registerSchema(schema);

      expect(registry.getSchema('test-group')).toEqual(schema);
    });

    // EC-7: Invalid slots type
    it('throws INVALID_SCHEMA when slots is not array', () => {
      const registry = new SchemaRegistry();
      const schema = {
        'schema-id': 'test-group',
        slots: 'not-an-array',
      };

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
      expect(() => registry.registerSchema(schema)).toThrow(
        /Invalid slots type/
      );
    });

    // EC-7: Invalid slot structure
    it('throws INVALID_SCHEMA when slot missing id', () => {
      const registry = new SchemaRegistry();
      const schema = {
        'schema-id': 'test-group',
        slots: [{ schema: 'test-schema' }],
      };

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
      expect(() => registry.registerSchema(schema)).toThrow(
        /missing required field 'id'/
      );
    });

    // Section validation
    it('validates sections in node schema', () => {
      const registry = new SchemaRegistry();
      const schema: NodeSchema = {
        'schema-id': 'test',
        sections: {
          required: [{ id: 'overview', type: 'text' }],
          optional: [{ id: 'notes', type: 'text' }],
          dynamic: [{ 'id-pattern': 'phase-{n}', type: 'task-list', min: 1 }],
        },
      };

      registry.registerSchema(schema);

      expect(registry.getSchema('test')).toEqual(schema);
    });

    // EC-7: Invalid sections type
    it('throws INVALID_SCHEMA when sections is not object', () => {
      const registry = new SchemaRegistry();
      const schema = {
        'schema-id': 'test',
        sections: 'not-an-object',
      } as unknown as NodeSchema;

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
      expect(() => registry.registerSchema(schema)).toThrow(
        /Invalid sections type/
      );
    });

    // EC-7: Invalid dynamic section min
    it('throws INVALID_SCHEMA when dynamic section min is negative', () => {
      const registry = new SchemaRegistry();
      const schema: NodeSchema = {
        'schema-id': 'test',
        sections: {
          dynamic: [{ 'id-pattern': 'phase-{n}', type: 'task-list', min: -1 }],
        },
      };

      expect(() => registry.registerSchema(schema)).toThrow(InvalidSchemaError);
      expect(() => registry.registerSchema(schema)).toThrow(
        /must be non-negative number/
      );
    });
  });

  describe('getSchema', () => {
    // IR-36: getSchema returns definition for registered schema
    it('returns registered schema definition', () => {
      const registry = new SchemaRegistry();
      const schema: NodeSchema = {
        'schema-id': 'test-schema',
        version: '1.0',
      };

      registry.registerSchema(schema);

      const result = registry.getSchema('test-schema');
      expect(result).toEqual(schema);
    });

    // EC-6: Schema ID not registered
    it('throws SCHEMA_NOT_FOUND for unregistered schema', () => {
      const registry = new SchemaRegistry();

      expect(() => registry.getSchema('unknown-schema')).toThrow(
        SchemaNotFoundError
      );
      expect(() => registry.getSchema('unknown-schema')).toThrow(
        /not registered/
      );
    });

    // Verify error structure
    it('SCHEMA_NOT_FOUND has correct error structure', () => {
      const registry = new SchemaRegistry();

      try {
        registry.getSchema('missing-schema');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(SchemaNotFoundError);
        const error = e as SchemaNotFoundError;
        expect(error.code).toBe('SCHEMA_NOT_FOUND');
        expect(error.schema).toBe('missing-schema');
        expect(error.message).toContain('missing-schema');
      }
    });
  });

  describe('listSchemas', () => {
    // IR-35: listSchemas returns all registered IDs
    it('returns all registered schema IDs', () => {
      const registry = new SchemaRegistry();

      registry.registerSchema({ 'schema-id': 'schema-1' });
      registry.registerSchema({ 'schema-id': 'schema-2' });
      registry.registerSchema({ 'schema-id': 'schema-3' });

      const list = registry.listSchemas();
      expect(list).toHaveLength(3);
      expect(list).toContain('schema-1');
      expect(list).toContain('schema-2');
      expect(list).toContain('schema-3');
    });

    it('returns empty array when no schemas registered', () => {
      const registry = new SchemaRegistry();

      expect(registry.listSchemas()).toEqual([]);
    });

    it('does not include duplicates', () => {
      const registry = new SchemaRegistry();
      const schema = { 'schema-id': 'test' };

      registry.registerSchema(schema);
      registry.registerSchema(schema);

      expect(registry.listSchemas()).toEqual(['test']);
    });
  });
});

describe('validateMetadataField', () => {
  // AC-16: Required metadata fields enforced
  it('throws VALIDATION_ERROR when required field is null', () => {
    const fieldDef: FieldDef = { type: 'string', required: true };

    expect(() =>
      validateMetadataField('status', null, fieldDef, 'test/@meta/status')
    ).toThrow(ValidationError);
    expect(() =>
      validateMetadataField('status', null, fieldDef, 'test/@meta/status')
    ).toThrow(/Required field/);
  });

  it('throws VALIDATION_ERROR when required field is undefined', () => {
    const fieldDef: FieldDef = { type: 'string', required: true };

    expect(() =>
      validateMetadataField('status', undefined, fieldDef, 'test/@meta/status')
    ).toThrow(ValidationError);
  });

  it('allows null for non-required field', () => {
    const fieldDef: FieldDef = { type: 'string', required: false };

    expect(() =>
      validateMetadataField('status', null, fieldDef, 'test/@meta/status')
    ).not.toThrow();
  });

  // Type validation
  it('validates string type', () => {
    const fieldDef: FieldDef = { type: 'string' };

    expect(() =>
      validateMetadataField('name', 'value', fieldDef, 'test/@meta/name')
    ).not.toThrow();

    expect(() =>
      validateMetadataField('name', 123, fieldDef, 'test/@meta/name')
    ).toThrow(ValidationError);
  });

  it('validates number type', () => {
    const fieldDef: FieldDef = { type: 'number' };

    expect(() =>
      validateMetadataField('count', 42, fieldDef, 'test/@meta/count')
    ).not.toThrow();

    expect(() =>
      validateMetadataField(
        'count',
        'not-a-number',
        fieldDef,
        'test/@meta/count'
      )
    ).toThrow(ValidationError);
  });

  it('validates boolean type', () => {
    const fieldDef: FieldDef = { type: 'boolean' };

    expect(() =>
      validateMetadataField('active', true, fieldDef, 'test/@meta/active')
    ).not.toThrow();

    expect(() =>
      validateMetadataField('active', 'true', fieldDef, 'test/@meta/active')
    ).toThrow(ValidationError);
  });

  // AC-17: Enum values validated
  it('validates enum values against allowed list', () => {
    const fieldDef: FieldDef = {
      type: 'enum',
      values: ['draft', 'locked', 'closed'],
    };

    expect(() =>
      validateMetadataField('status', 'draft', fieldDef, 'test/@meta/status')
    ).not.toThrow();

    expect(() =>
      validateMetadataField('status', 'invalid', fieldDef, 'test/@meta/status')
    ).toThrow(ValidationError);
    expect(() =>
      validateMetadataField('status', 'invalid', fieldDef, 'test/@meta/status')
    ).toThrow(/not in allowed values/);
  });

  it('validates date format', () => {
    const fieldDef: FieldDef = { type: 'date' };

    expect(() =>
      validateMetadataField(
        'created',
        '2026-02-05',
        fieldDef,
        'test/@meta/created'
      )
    ).not.toThrow();

    expect(() =>
      validateMetadataField(
        'created',
        '02/05/2026',
        fieldDef,
        'test/@meta/created'
      )
    ).toThrow(ValidationError);
    expect(() =>
      validateMetadataField(
        'created',
        '02/05/2026',
        fieldDef,
        'test/@meta/created'
      )
    ).toThrow(/YYYY-MM-DD format/);
  });

  it('validates ref type as string', () => {
    const fieldDef: FieldDef = { type: 'ref' };

    expect(() =>
      validateMetadataField(
        'parent',
        'group/slot',
        fieldDef,
        'test/@meta/parent'
      )
    ).not.toThrow();

    expect(() =>
      validateMetadataField('parent', 123, fieldDef, 'test/@meta/parent')
    ).toThrow(ValidationError);
  });

  it('validates string[] type', () => {
    const fieldDef: FieldDef = { type: 'string[]' };

    expect(() =>
      validateMetadataField('tags', ['a', 'b'], fieldDef, 'test/@meta/tags')
    ).not.toThrow();

    expect(() =>
      validateMetadataField('tags', 'not-array', fieldDef, 'test/@meta/tags')
    ).toThrow(ValidationError);

    expect(() =>
      validateMetadataField('tags', [1, 2], fieldDef, 'test/@meta/tags')
    ).toThrow(ValidationError);
  });
});

describe('validateMetadata', () => {
  // AC-16: Required metadata fields enforced
  it('validates all metadata fields against schema', () => {
    const schema: NodeSchema = {
      'schema-id': 'test',
      metadata: {
        fields: {
          status: { type: 'enum', values: ['draft', 'locked'], required: true },
          created: { type: 'date', required: true },
        },
      },
    };

    const metadata = { status: 'draft', created: '2026-02-05' };

    expect(() => validateMetadata(metadata, schema, 'test/node')).not.toThrow();
  });

  it('throws VALIDATION_ERROR when required field missing', () => {
    const schema: NodeSchema = {
      'schema-id': 'test',
      metadata: {
        fields: {
          status: { type: 'string', required: true },
        },
      },
    };

    const metadata = {};

    expect(() => validateMetadata(metadata, schema, 'test/node')).toThrow(
      ValidationError
    );
    expect(() => validateMetadata(metadata, schema, 'test/node')).toThrow(
      /Required field 'status' is missing/
    );
  });

  it('allows extra fields not in schema', () => {
    const schema: NodeSchema = {
      'schema-id': 'test',
      metadata: {
        fields: {
          status: { type: 'string' },
        },
      },
    };

    const metadata = { status: 'draft', extraField: 'value' };

    expect(() => validateMetadata(metadata, schema, 'test/node')).not.toThrow();
  });

  it('handles schema without metadata section', () => {
    const schema: NodeSchema = {
      'schema-id': 'test',
    };

    const metadata = { anyField: 'value' };

    expect(() => validateMetadata(metadata, schema, 'test/node')).not.toThrow();
  });
});

describe('matchDynamicPattern', () => {
  // AC-13: Dynamic pattern {n} matches digits
  it('matches {n} pattern with digits', () => {
    expect(matchDynamicPattern('phase-1', 'phase-{n}')).toBe(true);
    expect(matchDynamicPattern('phase-42', 'phase-{n}')).toBe(true);
    expect(matchDynamicPattern('phase-123', 'phase-{n}')).toBe(true);
  });

  it('rejects {n} pattern with non-digits', () => {
    expect(matchDynamicPattern('phase-a', 'phase-{n}')).toBe(false);
    expect(matchDynamicPattern('phase-1a', 'phase-{n}')).toBe(false);
    expect(matchDynamicPattern('phase-', 'phase-{n}')).toBe(false);
  });

  // AC-13: Dynamic pattern {name} matches slugs
  it('matches {name} pattern with slugs', () => {
    expect(matchDynamicPattern('section-abc', 'section-{name}')).toBe(true);
    expect(matchDynamicPattern('section-abc-123', 'section-{name}')).toBe(true);
    expect(matchDynamicPattern('section-test', 'section-{name}')).toBe(true);
  });

  it('rejects {name} pattern with invalid slugs', () => {
    expect(matchDynamicPattern('section-ABC', 'section-{name}')).toBe(false);
    expect(matchDynamicPattern('section-', 'section-{name}')).toBe(false);
    expect(matchDynamicPattern('section--test', 'section-{name}')).toBe(false);
  });

  it('matches literal patterns', () => {
    expect(matchDynamicPattern('overview', 'overview')).toBe(true);
    expect(matchDynamicPattern('other', 'overview')).toBe(false);
  });

  it('handles multiple placeholders', () => {
    expect(matchDynamicPattern('item-1-notes', 'item-{n}-{name}')).toBe(true);
    expect(matchDynamicPattern('item-42-test', 'item-{n}-{name}')).toBe(true);
    expect(matchDynamicPattern('item-a-notes', 'item-{n}-{name}')).toBe(false);
  });

  it('escapes regex special characters in pattern', () => {
    expect(matchDynamicPattern('test.1', 'test.{n}')).toBe(true);
    expect(matchDynamicPattern('test+1', 'test+{n}')).toBe(true);
  });
});

describe('validateDynamicSectionId', () => {
  // AC-14: Pattern mismatch throws PATTERN_MISMATCH
  it('throws PATTERN_MISMATCH when ID does not match pattern', () => {
    expect(() =>
      validateDynamicSectionId('phase-abc', 'phase-{n}', 'test/node/phase-abc')
    ).toThrow(PatternMismatchError);

    try {
      validateDynamicSectionId('phase-abc', 'phase-{n}', 'test/node/phase-abc');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PatternMismatchError);
      const error = e as PatternMismatchError;
      expect(error.code).toBe('PATTERN_MISMATCH');
      expect(error.pattern).toBe('phase-{n}');
      expect(error.path).toBe('test/node/phase-abc');
    }
  });

  it('does not throw when ID matches pattern', () => {
    expect(() =>
      validateDynamicSectionId('phase-1', 'phase-{n}', 'test/node/phase-1')
    ).not.toThrow();

    expect(() =>
      validateDynamicSectionId(
        'section-test',
        'section-{name}',
        'test/node/section-test'
      )
    ).not.toThrow();
  });
});

describe('validateDynamicSectionMin', () => {
  // AC-19: Dynamic section minimum counts
  it('throws VALIDATION_ERROR when count below minimum', () => {
    const dynamicDef: DynamicSectionDef = {
      'id-pattern': 'phase-{n}',
      type: 'task-list',
      min: 2,
    };

    const sectionIds = ['phase-1', 'overview'];

    expect(() =>
      validateDynamicSectionMin(sectionIds, dynamicDef, 'test/node')
    ).toThrow(ValidationError);
    expect(() =>
      validateDynamicSectionMin(sectionIds, dynamicDef, 'test/node')
    ).toThrow(/requires minimum 2 sections, found 1/);
  });

  it('does not throw when count meets minimum', () => {
    const dynamicDef: DynamicSectionDef = {
      'id-pattern': 'phase-{n}',
      type: 'task-list',
      min: 2,
    };

    const sectionIds = ['phase-1', 'phase-2', 'overview'];

    expect(() =>
      validateDynamicSectionMin(sectionIds, dynamicDef, 'test/node')
    ).not.toThrow();
  });

  it('treats undefined min as 0', () => {
    const dynamicDef: DynamicSectionDef = {
      'id-pattern': 'phase-{n}',
      type: 'task-list',
    };

    const sectionIds: string[] = [];

    expect(() =>
      validateDynamicSectionMin(sectionIds, dynamicDef, 'test/node')
    ).not.toThrow();
  });

  it('validates only matching sections', () => {
    const dynamicDef: DynamicSectionDef = {
      'id-pattern': 'phase-{n}',
      type: 'task-list',
      min: 1,
    };

    const sectionIds = ['overview', 'notes', 'summary'];

    expect(() =>
      validateDynamicSectionMin(sectionIds, dynamicDef, 'test/node')
    ).toThrow(ValidationError);
  });
});

describe('checkSchemaDrift', () => {
  // AC-20: Schema drift detection
  it('returns warning when versions differ', () => {
    const warning = checkSchemaDrift('1.0', '2.0');

    expect(warning).toBeDefined();
    expect(warning).toContain('version mismatch');
    expect(warning).toContain('1.0');
    expect(warning).toContain('2.0');
  });

  it('returns undefined when versions match', () => {
    const warning = checkSchemaDrift('1.0', '1.0');

    expect(warning).toBeUndefined();
  });

  it('returns undefined when node version is undefined', () => {
    const warning = checkSchemaDrift(undefined, '1.0');

    expect(warning).toBeUndefined();
  });

  it('returns undefined when current version is undefined', () => {
    const warning = checkSchemaDrift('1.0', undefined);

    expect(warning).toBeUndefined();
  });

  it('returns undefined when both versions are undefined', () => {
    const warning = checkSchemaDrift(undefined, undefined);

    expect(warning).toBeUndefined();
  });
});
