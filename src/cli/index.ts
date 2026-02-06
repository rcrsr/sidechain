#!/usr/bin/env node

/**
 * CLI entry point for Sidechain
 * Covers: IC-12
 *
 * All commands output JSON to stdout.
 * Configuration loaded from sidechain.json in cwd or --config <path>.
 * Success: { ok: true, ...result }
 * Failure: { ok: false, error, message }
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

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
 * Parse command-line arguments into command, args, and flags
 */
function parseArgs(argv: string[]): {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
} {
  const command = argv[2] ?? '';
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 3;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) {
      break;
    }

    if (arg.startsWith('--')) {
      const flagName = arg.slice(2);
      const nextArg = argv[i + 1];

      // Check if next arg is a value or another flag
      if (nextArg !== undefined && !nextArg.startsWith('--')) {
        flags[flagName] = nextArg;
        i += 2;
      } else {
        flags[flagName] = true;
        i += 1;
      }
    } else {
      args.push(arg);
      i += 1;
    }
  }

  return { command, args, flags };
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
 * Route commands to Store methods and return result
 */
async function routeCommand(
  store: Store & ControlPlane,
  command: string,
  args: string[],
  flags: Record<string, string | boolean>
): Promise<unknown> {
  switch (command) {
    case 'list': {
      // sidechain list [group]
      const group = args[0];
      if (group !== undefined) {
        const slots = await store.list(group);
        return { ok: true, slots };
      } else {
        const groups = await store.list();
        return { ok: true, groups };
      }
    }

    case 'exists': {
      // sidechain exists <path>
      const nodePath = args[0];
      if (nodePath === undefined) {
        throw new Error('Missing required argument: path');
      }
      const exists = await store.exists(nodePath);
      return { ok: true, exists };
    }

    case 'get': {
      // sidechain get <path>
      const nodePath = args[0];
      if (nodePath === undefined) {
        throw new Error('Missing required argument: path');
      }
      const node = await store.get(nodePath);
      return { ok: true, ...node };
    }

    case 'create-group': {
      // sidechain create-group <id>
      const schemaId = args[0];
      if (schemaId === undefined) {
        throw new Error('Missing required argument: schema-id');
      }
      const result = await store.createGroup(schemaId);
      return { ok: true, ...result };
    }

    case 'delete-group': {
      // sidechain delete-group <id>
      const groupAddress = args[0];
      if (groupAddress === undefined) {
        throw new Error('Missing required argument: group-address');
      }
      const result = await store.deleteGroup(groupAddress);
      return result;
    }

    case 'describe-group': {
      // sidechain describe-group <ref>
      const groupAddress = args[0];
      if (groupAddress === undefined) {
        throw new Error('Missing required argument: group-address');
      }
      const result = await store.describeGroup(groupAddress);
      return { ok: true, ...result };
    }

    case 'validate-group': {
      // sidechain validate-group <group>
      const groupAddress = args[0];
      if (groupAddress === undefined) {
        throw new Error('Missing required argument: group-address');
      }
      const result = await store.validateGroup(groupAddress);
      return { ok: true, ...result };
    }

    case 'meta': {
      // sidechain meta <path> [field]
      const nodePath = args[0];
      if (nodePath === undefined) {
        throw new Error('Missing required argument: path');
      }
      const field = args[1];
      if (field !== undefined) {
        const result = await store.meta(nodePath, field);
        return { ok: true, ...result };
      } else {
        const result = await store.meta(nodePath);
        return { ok: true, ...result };
      }
    }

    case 'set-meta': {
      // sidechain set-meta <path> <field> <value>
      const nodePath = args[0];
      const field = args[1];
      const value = args[2];
      if (
        nodePath === undefined ||
        field === undefined ||
        value === undefined
      ) {
        throw new Error('Missing required arguments: path, field, value');
      }
      // Parse value as JSON if possible
      let parsedValue: unknown = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
      const result = await store.setMeta(nodePath, field, parsedValue);
      return result;
    }

    case 'sections': {
      // sidechain sections <path>
      const nodePath = args[0];
      if (nodePath === undefined) {
        throw new Error('Missing required argument: path');
      }
      const result = await store.sections(nodePath);
      return { ok: true, sections: result };
    }

    case 'section': {
      // sidechain section <path> <id>
      const nodePath = args[0];
      const sectionId = args[1];
      if (nodePath === undefined || sectionId === undefined) {
        throw new Error('Missing required arguments: path, section-id');
      }
      const result = await store.section(nodePath, sectionId);
      return { ok: true, ...result };
    }

    case 'write-section': {
      // sidechain write-section <path> <id> --content <text>
      const nodePath = args[0];
      const sectionId = args[1];
      const content = flags['content'];
      if (
        nodePath === undefined ||
        sectionId === undefined ||
        content === undefined
      ) {
        throw new Error(
          'Missing required arguments: path, section-id, --content'
        );
      }
      const result = await store.writeSection(
        nodePath,
        sectionId,
        content as string
      );
      return result;
    }

    case 'append-section': {
      // sidechain append-section <path> <id> --content <text>
      const nodePath = args[0];
      const sectionId = args[1];
      const content = flags['content'];
      if (
        nodePath === undefined ||
        sectionId === undefined ||
        content === undefined
      ) {
        throw new Error(
          'Missing required arguments: path, section-id, --content'
        );
      }
      const result = await store.appendSection(
        nodePath,
        sectionId,
        content as string
      );
      return result;
    }

    case 'add-section': {
      // sidechain add-section <path> --id <id> --type <type> [--after <section>]
      const nodePath = args[0];
      const id = flags['id'];
      const type = flags['type'];
      const after = flags['after'];
      if (nodePath === undefined || id === undefined || type === undefined) {
        throw new Error('Missing required arguments: path, --id, --type');
      }
      const def: { id: string; type: string; after?: string } = {
        id: id as string,
        type: type as string,
      };
      if (typeof after === 'string') {
        def.after = after;
      }
      const result = await store.addSection(nodePath, def);
      return result;
    }

    case 'remove-section': {
      // sidechain remove-section <path> <id>
      const nodePath = args[0];
      const sectionId = args[1];
      if (nodePath === undefined || sectionId === undefined) {
        throw new Error('Missing required arguments: path, section-id');
      }
      const result = await store.removeSection(nodePath, sectionId);
      return result;
    }

    case 'populate': {
      // sidechain populate <path> --data '{...}' | --file <file>
      const nodePath = args[0];
      if (nodePath === undefined) {
        throw new Error('Missing required argument: path');
      }

      let populateData: unknown;
      if (flags['data'] !== undefined) {
        // Parse --data JSON
        try {
          populateData = JSON.parse(flags['data'] as string);
        } catch (error) {
          throw new Error(
            `Invalid JSON in --data: ${error instanceof Error ? error.message : 'unknown error'}`
          );
        }
      } else if (flags['file'] !== undefined) {
        // Read file content
        const filePath = flags['file'] as string;
        const resolvedPath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`File not found: ${resolvedPath}`);
        }
        const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
        try {
          populateData = JSON.parse(fileContent);
        } catch (error) {
          throw new Error(
            `Invalid JSON in file ${filePath}: ${error instanceof Error ? error.message : 'unknown error'}`
          );
        }
      } else {
        throw new Error('Missing required flag: --data or --file');
      }

      const result = await store.populate(
        nodePath,
        populateData as {
          metadata?: Record<string, unknown>;
          sections: Record<string, unknown>;
        }
      );
      return result;
    }

    case 'item': {
      // sidechain item <operation> <path> <section> [item] [--data '{...}']
      const operation = args[0];
      const nodePath = args[1];
      const sectionId = args[2];

      if (
        operation === undefined ||
        nodePath === undefined ||
        sectionId === undefined
      ) {
        throw new Error(
          'Missing required arguments: operation, path, section-id'
        );
      }

      switch (operation) {
        case 'get': {
          // sidechain item get <path> <section> <item>
          const itemId = args[3];
          if (itemId === undefined) {
            throw new Error('Missing required argument: item-id');
          }
          const result = await store.item.get(nodePath, sectionId, itemId);
          return { ok: true, ...result };
        }

        case 'add': {
          // sidechain item add <path> <section> --data '{...}'
          const data = flags['data'];
          if (data === undefined) {
            throw new Error('Missing required flag: --data');
          }
          let parsedData: Record<string, unknown>;
          try {
            parsedData = JSON.parse(data as string) as Record<string, unknown>;
          } catch (error) {
            throw new Error(
              `Invalid JSON in --data: ${error instanceof Error ? error.message : 'unknown error'}`
            );
          }
          const result = await store.item.add(nodePath, sectionId, parsedData);
          return result;
        }

        case 'update': {
          // sidechain item update <path> <section> <item> --data '{...}'
          const itemId = args[3];
          const data = flags['data'];
          if (itemId === undefined || data === undefined) {
            throw new Error('Missing required arguments: item-id, --data');
          }
          let parsedData: Record<string, unknown>;
          try {
            parsedData = JSON.parse(data as string) as Record<string, unknown>;
          } catch (error) {
            throw new Error(
              `Invalid JSON in --data: ${error instanceof Error ? error.message : 'unknown error'}`
            );
          }
          const result = await store.item.update(
            nodePath,
            sectionId,
            itemId,
            parsedData
          );
          return result;
        }

        case 'remove': {
          // sidechain item remove <path> <section> <item>
          const itemId = args[3];
          if (itemId === undefined) {
            throw new Error('Missing required argument: item-id');
          }
          const result = await store.item.remove(nodePath, sectionId, itemId);
          return result;
        }

        default:
          throw new Error(`Unknown item operation: ${operation}`);
      }
    }

    case 'mounts': {
      // sidechain mounts
      const result = await store.mounts();
      return { ok: true, mounts: result };
    }

    case 'info': {
      // sidechain info
      const result = await store.info();
      return { ok: true, ...result };
    }

    case 'list-schemas': {
      // sidechain list-schemas
      const result = await store.listSchemas();
      return { ok: true, schemas: result };
    }

    case 'get-schema': {
      // sidechain get-schema <id>
      const schemaId = args[0];
      if (schemaId === undefined) {
        throw new Error('Missing required argument: schema-id');
      }
      const result = await store.getSchema(schemaId);
      return { ok: true, schema: result };
    }

    case 'list-content-types': {
      // sidechain list-content-types
      const result = await store.listContentTypes();
      return { ok: true, contentTypes: result };
    }

    case 'describe': {
      // sidechain describe <schema-or-path>
      const schemaOrPath = args[0];
      if (schemaOrPath === undefined) {
        throw new Error('Missing required argument: schema-or-path');
      }
      const result = await store.describe(schemaOrPath);
      return { ok: true, ...result };
    }

    case 'validate': {
      // sidechain validate <path>
      const nodePath = args[0];
      if (nodePath === undefined) {
        throw new Error('Missing required argument: path');
      }
      const result = await store.validate(nodePath);
      return { ok: true, ...result };
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const { command, args, flags } = parseArgs(process.argv);

    // Get config path from --config flag or default
    const configPath =
      typeof flags['config'] === 'string' ? flags['config'] : 'sidechain.json';

    // Load configuration
    const config = loadConfig(configPath);

    // Initialize Store
    const store = await Sidechain.open(config);

    // Route command
    const result = await routeCommand(store, command, args, flags);

    // Output JSON to stdout
    console.log(JSON.stringify(result, null, 2));

    process.exit(0);
  } catch (error) {
    // Format error as JSON with specific fields per error type
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

    console.log(JSON.stringify(errorResult, null, 2));

    process.exit(1);
  }
}

void main();
