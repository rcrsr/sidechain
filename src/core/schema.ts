/**
 * Schema registry and validation logic
 * Covers: IR-35, IR-36, IR-37, EC-6, EC-7, EC-8, EC-9, EC-13, AC-3, AC-13, AC-14, AC-16, AC-17, AC-19, AC-20, IC-5
 */

import type {
  DynamicSectionDef,
  FieldDef,
  FieldType,
  NodeSchema,
  SchemaDefinition,
  SectionDef,
} from '../types/schema.js';
import {
  InvalidSchemaError,
  PatternMismatchError,
  SchemaNotFoundError,
  ValidationError,
} from './errors.js';

/**
 * Schema registry storing validated schema definitions
 */
export class SchemaRegistry {
  private readonly schemas = new Map<string, SchemaDefinition>();

  /**
   * Register a schema definition
   * IR-37: registerSchema(schema)
   * EC-7: Schema definition malformed
   * EC-8: Schema ID already registered with different definition
   * AC-3: Registered schemas accessible
   */
  registerSchema(schema: SchemaDefinition): void {
    // Validate schema structure (EC-7)
    this.validateSchemaStructure(schema);

    const schemaId = schema['schema-id'];

    // Check for duplicate with different definition (EC-8)
    const existing = this.schemas.get(schemaId);
    if (existing !== undefined) {
      if (!this.schemasEqual(existing, schema)) {
        throw new ValidationError(
          `@schema/${schemaId}`,
          `Schema ID '${schemaId}' already registered with different definition`,
          schemaId
        );
      }
      // Same definition, no-op
      return;
    }

    // Store schema
    this.schemas.set(schemaId, schema);
  }

  /**
   * Retrieve schema by ID
   * IR-36: getSchema(schema)
   * EC-6: Schema ID not registered
   */
  getSchema(schemaId: string): SchemaDefinition {
    const schema = this.schemas.get(schemaId);
    if (schema === undefined) {
      throw new SchemaNotFoundError(
        schemaId,
        `Schema '${schemaId}' not registered`
      );
    }
    return schema;
  }

  /**
   * List all registered schema IDs
   * IR-35: listSchemas()
   */
  listSchemas(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Validate schema structure
   * EC-7: Schema definition malformed
   */
  private validateSchemaStructure(schema: SchemaDefinition): void {
    // Required: schema-id
    if (typeof schema['schema-id'] !== 'string' || schema['schema-id'] === '') {
      throw new InvalidSchemaError('Schema missing required field: schema-id', {
        field: 'schema-id',
      });
    }

    // Optional: version (NodeSchema only)
    const schemaUnknown = schema as unknown as Record<string, unknown>;
    if (
      schemaUnknown['version'] !== undefined &&
      typeof schemaUnknown['version'] !== 'string'
    ) {
      throw new InvalidSchemaError(
        `Invalid version type for schema '${schema['schema-id']}'`,
        {
          field: 'version',
          expected: 'string',
          got: typeof schemaUnknown['version'],
        }
      );
    }

    // Optional: description
    if (
      schemaUnknown['description'] !== undefined &&
      typeof schemaUnknown['description'] !== 'string'
    ) {
      throw new InvalidSchemaError(
        `Invalid description type for schema '${schema['schema-id']}'`,
        {
          field: 'description',
          expected: 'string',
          got: typeof schemaUnknown['description'],
        }
      );
    }

    // Type-specific validation
    if ('slots' in schema) {
      // Group schema
      this.validateGroupSchema(schema);
    } else if ('metadata' in schema || 'sections' in schema) {
      // Node schema
      this.validateNodeSchema(schema);
    }
  }

  /**
   * Validate group schema structure
   */
  private validateGroupSchema(
    schema: SchemaDefinition & { slots: unknown }
  ): void {
    if (!Array.isArray(schema.slots)) {
      throw new InvalidSchemaError(
        `Invalid slots type for schema '${schema['schema-id']}'`,
        { field: 'slots', expected: 'array', got: typeof schema.slots }
      );
    }

    for (let i = 0; i < schema.slots.length; i++) {
      const slot: unknown = schema.slots[i];
      if (typeof slot !== 'object' || slot === null) {
        throw new InvalidSchemaError(
          `Invalid slot at index ${i} in schema '${schema['schema-id']}'`,
          { field: `slots[${i}]`, expected: 'object', got: typeof slot }
        );
      }

      const slotObj = slot as Record<string, unknown>;
      if (typeof slotObj['id'] !== 'string' || slotObj['id'] === '') {
        throw new InvalidSchemaError(
          `Slot at index ${i} missing required field 'id' in schema '${schema['schema-id']}'`,
          { field: `slots[${i}].id` }
        );
      }

      if (typeof slotObj['schema'] !== 'string' || slotObj['schema'] === '') {
        throw new InvalidSchemaError(
          `Slot '${slotObj['id']}' missing required field 'schema' in schema '${schema['schema-id']}'`,
          { field: `slots[${i}].schema` }
        );
      }
    }
  }

  /**
   * Validate node schema structure
   */
  private validateNodeSchema(schema: NodeSchema): void {
    // Validate metadata fields
    if (schema.metadata !== undefined) {
      const metadata: unknown = schema.metadata;
      if (typeof metadata !== 'object' || metadata === null) {
        throw new InvalidSchemaError(
          `Invalid metadata type for schema '${schema['schema-id']}'`,
          { field: 'metadata', expected: 'object', got: typeof metadata }
        );
      }

      const metadataObj = metadata as Record<string, unknown>;
      const fields: unknown = metadataObj['fields'];
      if (typeof fields !== 'object' || fields === null) {
        throw new InvalidSchemaError(
          `Invalid metadata.fields type for schema '${schema['schema-id']}'`,
          { field: 'metadata.fields', expected: 'object', got: typeof fields }
        );
      }

      for (const [fieldId, fieldDef] of Object.entries(
        fields as Record<string, FieldDef>
      )) {
        this.validateFieldDef(fieldId, fieldDef, schema['schema-id']);
      }
    }

    // Validate sections
    if (schema.sections !== undefined) {
      const sections: unknown = schema.sections;
      if (typeof sections !== 'object' || sections === null) {
        throw new InvalidSchemaError(
          `Invalid sections type for schema '${schema['schema-id']}'`,
          { field: 'sections', expected: 'object', got: typeof sections }
        );
      }

      const sectionsObj = sections as Record<string, unknown>;

      if (sectionsObj['required'] !== undefined) {
        if (!Array.isArray(sectionsObj['required'])) {
          throw new InvalidSchemaError(
            `Invalid sections.required type for schema '${schema['schema-id']}'`,
            {
              field: 'sections.required',
              expected: 'array',
              got: typeof sectionsObj['required'],
            }
          );
        }
        for (let i = 0; i < sectionsObj['required'].length; i++) {
          const sectionDef: unknown = (sectionsObj['required'] as unknown[])[i];
          this.validateSectionDef(
            sectionDef as SectionDef,
            `sections.required[${i}]`,
            schema['schema-id']
          );
        }
      }

      if (sectionsObj['optional'] !== undefined) {
        if (!Array.isArray(sectionsObj['optional'])) {
          throw new InvalidSchemaError(
            `Invalid sections.optional type for schema '${schema['schema-id']}'`,
            {
              field: 'sections.optional',
              expected: 'array',
              got: typeof sectionsObj['optional'],
            }
          );
        }
        for (let i = 0; i < sectionsObj['optional'].length; i++) {
          const sectionDef: unknown = (sectionsObj['optional'] as unknown[])[i];
          this.validateSectionDef(
            sectionDef as SectionDef,
            `sections.optional[${i}]`,
            schema['schema-id']
          );
        }
      }

      if (sectionsObj['dynamic'] !== undefined) {
        if (!Array.isArray(sectionsObj['dynamic'])) {
          throw new InvalidSchemaError(
            `Invalid sections.dynamic type for schema '${schema['schema-id']}'`,
            {
              field: 'sections.dynamic',
              expected: 'array',
              got: typeof sectionsObj['dynamic'],
            }
          );
        }
        for (let i = 0; i < sectionsObj['dynamic'].length; i++) {
          const sectionDef: unknown = (sectionsObj['dynamic'] as unknown[])[i];
          this.validateDynamicSectionDef(
            sectionDef as DynamicSectionDef,
            `sections.dynamic[${i}]`,
            schema['schema-id']
          );
        }
      }
    }
  }

  /**
   * Validate field definition
   */
  private validateFieldDef(
    fieldId: string,
    fieldDef: FieldDef,
    schemaId: string
  ): void {
    const fieldDefUnknown: unknown = fieldDef;
    if (typeof fieldDefUnknown !== 'object' || fieldDefUnknown === null) {
      throw new InvalidSchemaError(
        `Invalid field definition for '${fieldId}' in schema '${schemaId}'`,
        {
          field: `metadata.fields.${fieldId}`,
          expected: 'object',
          got: typeof fieldDefUnknown,
        }
      );
    }

    // Required: type
    const validTypes: FieldType[] = [
      'string',
      'number',
      'boolean',
      'enum',
      'date',
      'ref',
      'string[]',
    ];
    if (!validTypes.includes(fieldDef.type)) {
      throw new InvalidSchemaError(
        `Invalid field type for '${fieldId}' in schema '${schemaId}'`,
        {
          field: `metadata.fields.${fieldId}.type`,
          expected: validTypes,
          got: fieldDef.type,
        }
      );
    }

    // Enum type requires values array
    if (fieldDef.type === 'enum') {
      if (!Array.isArray(fieldDef.values) || fieldDef.values.length === 0) {
        throw new InvalidSchemaError(
          `Enum field '${fieldId}' must have non-empty 'values' array in schema '${schemaId}'`,
          { field: `metadata.fields.${fieldId}.values` }
        );
      }
      for (const value of fieldDef.values) {
        if (typeof value !== 'string') {
          throw new InvalidSchemaError(
            `Enum values must be strings for field '${fieldId}' in schema '${schemaId}'`,
            { field: `metadata.fields.${fieldId}.values`, got: typeof value }
          );
        }
      }
    }
  }

  /**
   * Validate section definition
   */
  private validateSectionDef(
    sectionDef: SectionDef,
    path: string,
    schemaId: string
  ): void {
    const sectionDefUnknown: unknown = sectionDef;
    if (typeof sectionDefUnknown !== 'object' || sectionDefUnknown === null) {
      throw new InvalidSchemaError(
        `Invalid section definition at '${path}' in schema '${schemaId}'`,
        { field: path, expected: 'object', got: typeof sectionDefUnknown }
      );
    }

    const section = sectionDefUnknown as Record<string, unknown>;
    if (typeof section['id'] !== 'string' || section['id'] === '') {
      throw new InvalidSchemaError(
        `Section at '${path}' missing required field 'id' in schema '${schemaId}'`,
        { field: `${path}.id` }
      );
    }

    if (typeof section['type'] !== 'string' || section['type'] === '') {
      throw new InvalidSchemaError(
        `Section '${section['id']}' missing required field 'type' in schema '${schemaId}'`,
        { field: `${path}.type` }
      );
    }
  }

  /**
   * Validate dynamic section definition
   */
  private validateDynamicSectionDef(
    sectionDef: DynamicSectionDef,
    path: string,
    schemaId: string
  ): void {
    const sectionDefUnknown: unknown = sectionDef;
    if (typeof sectionDefUnknown !== 'object' || sectionDefUnknown === null) {
      throw new InvalidSchemaError(
        `Invalid dynamic section definition at '${path}' in schema '${schemaId}'`,
        { field: path, expected: 'object', got: typeof sectionDefUnknown }
      );
    }

    const section = sectionDefUnknown as Record<string, unknown>;
    if (
      typeof section['id-pattern'] !== 'string' ||
      section['id-pattern'] === ''
    ) {
      throw new InvalidSchemaError(
        `Dynamic section at '${path}' missing required field 'id-pattern' in schema '${schemaId}'`,
        { field: `${path}.id-pattern` }
      );
    }

    if (typeof section['type'] !== 'string' || section['type'] === '') {
      throw new InvalidSchemaError(
        `Dynamic section at '${path}' missing required field 'type' in schema '${schemaId}'`,
        { field: `${path}.type` }
      );
    }

    if (section['min'] !== undefined) {
      const minValue = section['min'];
      if (typeof minValue !== 'number' || minValue < 0) {
        throw new InvalidSchemaError(
          `Dynamic section 'min' must be non-negative number at '${path}' in schema '${schemaId}'`,
          { field: `${path}.min`, got: minValue }
        );
      }
    }
  }

  /**
   * Deep equality check for schemas
   */
  private schemasEqual(a: SchemaDefinition, b: SchemaDefinition): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

/**
 * Validate metadata field value against field definition
 * EC-9: Value fails schema constraint
 * AC-16: Required metadata fields enforced
 * AC-17: Enum values validated
 */
export function validateMetadataField(
  fieldId: string,
  value: unknown,
  fieldDef: FieldDef,
  path: string
): void {
  // Required field check
  if (fieldDef.required === true && (value === null || value === undefined)) {
    throw new ValidationError(
      path,
      `Required field '${fieldId}' is missing or null`
    );
  }

  // Allow null/undefined for non-required fields
  if (value === null || value === undefined) {
    return;
  }

  // Type validation
  switch (fieldDef.type) {
    case 'string':
      if (typeof value !== 'string') {
        throw new ValidationError(
          path,
          `Field '${fieldId}' must be string, got ${typeof value}`
        );
      }
      break;

    case 'number':
      if (typeof value !== 'number') {
        throw new ValidationError(
          path,
          `Field '${fieldId}' must be number, got ${typeof value}`
        );
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new ValidationError(
          path,
          `Field '${fieldId}' must be boolean, got ${typeof value}`
        );
      }
      break;

    case 'enum':
      if (typeof value !== 'string') {
        throw new ValidationError(
          path,
          `Enum field '${fieldId}' must be string, got ${typeof value}`
        );
      }
      // AC-17: Enum validation
      if (fieldDef.values !== undefined && !fieldDef.values.includes(value)) {
        throw new ValidationError(
          path,
          `Field '${fieldId}' value '${value}' not in allowed values: [${fieldDef.values.join(', ')}]`
        );
      }
      break;

    case 'date':
      if (typeof value !== 'string') {
        throw new ValidationError(
          path,
          `Date field '${fieldId}' must be string, got ${typeof value}`
        );
      }
      // Validate ISO 8601 date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new ValidationError(
          path,
          `Date field '${fieldId}' must be in YYYY-MM-DD format, got '${value}'`
        );
      }
      break;

    case 'ref':
      if (typeof value !== 'string') {
        throw new ValidationError(
          path,
          `Reference field '${fieldId}' must be string, got ${typeof value}`
        );
      }
      break;

    case 'string[]':
      if (!Array.isArray(value)) {
        throw new ValidationError(
          path,
          `Field '${fieldId}' must be array, got ${typeof value}`
        );
      }
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== 'string') {
          throw new ValidationError(
            path,
            `Field '${fieldId}[${i}]' must be string, got ${typeof value[i]}`
          );
        }
      }
      break;
  }
}

/**
 * Validate metadata object against schema
 * AC-16: Required metadata fields enforced
 */
export function validateMetadata(
  metadata: Record<string, unknown>,
  schema: NodeSchema,
  basePath: string
): void {
  if (schema.metadata === undefined) {
    return;
  }

  const { fields } = schema.metadata;

  // Validate each field in metadata
  for (const [fieldId, value] of Object.entries(metadata)) {
    const fieldDef = fields[fieldId];
    if (fieldDef === undefined) {
      // Unknown field - allow it (schema doesn't restrict extra fields)
      continue;
    }

    const fieldPath = `${basePath}/@meta/${fieldId}`;
    validateMetadataField(fieldId, value, fieldDef, fieldPath);
  }

  // Check for missing required fields
  for (const [fieldId, fieldDef] of Object.entries(fields)) {
    if (fieldDef.required === true && !(fieldId in metadata)) {
      throw new ValidationError(
        `${basePath}/@meta/${fieldId}`,
        `Required field '${fieldId}' is missing`
      );
    }
  }
}

/**
 * Match section ID against dynamic pattern
 * AC-13: Dynamic pattern matching
 * AC-14: Pattern mismatch throws PATTERN_MISMATCH
 * EC-13: Dynamic section ID fails pattern
 *
 * Pattern rules:
 * - {n} matches [0-9]+
 * - {name} matches [a-z0-9][a-z0-9-]*
 */
export function matchDynamicPattern(
  sectionId: string,
  pattern: string
): boolean {
  // Convert pattern to regex
  // Escape special regex characters except our placeholders
  let regexPattern = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\\\{n\\\}/g, '(?:[0-9]+)') // Replace {n} with digit pattern
    .replace(/\\\{name\\\}/g, '(?:[a-z0-9][a-z0-9-]*)'); // Replace {name} with slug pattern

  // Anchor pattern to match entire string
  regexPattern = `^${regexPattern}$`;

  const regex = new RegExp(regexPattern);
  return regex.test(sectionId);
}

/**
 * Validate section ID against dynamic pattern
 * AC-14: Pattern mismatch throws PATTERN_MISMATCH
 */
export function validateDynamicSectionId(
  sectionId: string,
  pattern: string,
  path: string
): void {
  if (!matchDynamicPattern(sectionId, pattern)) {
    throw new PatternMismatchError(
      path,
      pattern,
      `Section ID '${sectionId}' does not match pattern '${pattern}'`
    );
  }
}

/**
 * Validate dynamic section minimum count
 * AC-19: Dynamic section minimum counts
 */
export function validateDynamicSectionMin(
  sectionIds: string[],
  dynamicDef: DynamicSectionDef,
  basePath: string
): void {
  const min = dynamicDef.min ?? 0;
  const matchingCount = sectionIds.filter((id) =>
    matchDynamicPattern(id, dynamicDef['id-pattern'])
  ).length;

  if (matchingCount < min) {
    throw new ValidationError(
      basePath,
      `Dynamic section pattern '${dynamicDef['id-pattern']}' requires minimum ${min} sections, found ${matchingCount}`
    );
  }
}

/**
 * Check for schema drift
 * AC-20: Schema drift detection
 *
 * Returns warning if node schema version differs from current schema version
 */
export function checkSchemaDrift(
  nodeSchemaVersion: string | undefined,
  currentSchemaVersion: string | undefined
): string | undefined {
  if (
    nodeSchemaVersion !== undefined &&
    currentSchemaVersion !== undefined &&
    nodeSchemaVersion !== currentSchemaVersion
  ) {
    return `Schema version mismatch: node has version '${nodeSchemaVersion}', current schema version is '${currentSchemaVersion}'`;
  }
  return undefined;
}
