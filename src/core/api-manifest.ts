/**
 * Public API Manifest for @sidechain/core
 *
 * This file documents all public exports from the core layer.
 * Internal-only exports are marked with [INTERNAL] comments.
 *
 * External consumers should only use exports NOT marked as [INTERNAL].
 * Internal exports are exported for testing or cross-module communication
 * within the sidechain codebase but are subject to breaking changes.
 */

// ============================================================================
// PRIMARY ENTRY POINTS
// ============================================================================

/**
 * Sidechain - Main store factory
 *
 * Creates a Store instance from configuration. This is the primary entry point
 * for all storage operations.
 *
 * Usage:
 * ```typescript
 * const store = await Sidechain.open(config);
 * ```
 *
 * @public
 */
export type { Sidechain } from './store.js';

/**
 * Client - Name-to-address resolution layer
 *
 * Manages friendly name mappings to cryptographic group addresses.
 * Operates above the Store layer to provide human-readable names.
 *
 * Usage:
 * ```typescript
 * const client = new Client(mappingPath);
 * const address = client.resolveAddress('my-group');
 * ```
 *
 * @public
 */
export type { Client } from './client.js';

// ============================================================================
// STORE INTERFACE
// ============================================================================

/**
 * Store - Core storage interface
 *
 * Defines all operations for groups, nodes, metadata, sections, and items.
 * All consumer code operates against this interface, never directly against backends.
 *
 * Key operations:
 * - Group management: createGroup, deleteGroup, listGroups
 * - Node operations: get, exists, populate, validate
 * - Metadata: meta, setMeta
 * - Sections: section, writeSection
 * - Items: item.get, item.add, item.update, item.remove
 *
 * @public
 */
export type { Store } from '../types/store.js';

/**
 * Result - Standard result envelope
 *
 * All write operations return Result containing token for optimistic concurrency.
 *
 * @public
 */
export type { Result } from '../types/store.js';

/**
 * NodeResponse - Complete node read response
 *
 * Contains metadata, sections, schema info, and tokens for updates.
 *
 * @public
 */
export type { NodeResponse } from '../types/store.js';

/**
 * GroupEntry - Group listing entry
 *
 * Returned by listGroups() with address and schema info.
 *
 * @public
 */
export type { GroupEntry } from '../types/store.js';

/**
 * GroupDescription - Detailed group information
 *
 * Describes a group's schema, slots, and configuration.
 *
 * @public
 */
export type { GroupDescription } from '../types/store.js';

/**
 * GroupResult - Group creation result
 *
 * Contains the cryptographic address of a newly created group.
 *
 * @public
 */
export type { GroupResult } from '../types/store.js';

/**
 * GroupValidation - Group validation result
 *
 * Contains valid flag, errors, warnings, and drift information.
 *
 * @public
 */
export type { GroupValidation } from '../types/store.js';

/**
 * SlotEntry - Node slot entry
 *
 * Describes a node slot within a group with schema and existence info.
 *
 * @public
 */
export type { SlotEntry } from '../types/store.js';

// ============================================================================
// METADATA OPERATIONS
// ============================================================================

/**
 * MetaResult - Metadata write result
 *
 * Contains updated token for continued optimistic concurrency.
 *
 * @public
 */
export type { MetaResult } from '../types/metadata.js';

/**
 * MetaReadResult - Metadata read result
 *
 * Contains field value and token for updates.
 *
 * @public
 */
export type { MetaReadResult } from '../types/metadata.js';

/**
 * TokenOpts - Token options for writes
 *
 * Optional token for optimistic concurrency control.
 *
 * @public
 */
export type { TokenOpts } from '../types/metadata.js';

// ============================================================================
// SECTION OPERATIONS
// ============================================================================

/**
 * SectionResponse - Section read response
 *
 * Contains section content, type info, and tokens for updates.
 *
 * @public
 */
export type { SectionResponse } from '../types/section.js';

/**
 * SectionSummary - Section summary for listings
 *
 * Minimal section info without full content.
 *
 * @public
 */
export type { SectionSummary } from '../types/section.js';

/**
 * PopulateData - Bulk section population data
 *
 * Used by populate() to write multiple sections atomically.
 *
 * @public
 */
export type { PopulateData } from '../types/section.js';

// ============================================================================
// ITEM OPERATIONS
// ============================================================================

/**
 * ItemOps - Item operations interface
 *
 * Provides CRUD operations for items within list-based sections.
 *
 * @public
 */
export type { ItemOps } from '../types/item.js';

/**
 * ItemResponse - Item read response
 *
 * Contains item content and token for updates.
 *
 * @public
 */
export type { ItemResponse } from '../types/item.js';

/**
 * ItemAddResult - Item addition result
 *
 * Contains itemId and updated token.
 *
 * @public
 */
export type { ItemAddResult } from '../types/item.js';

/**
 * ItemUpdateResult - Item update result
 *
 * Contains updated token for continued concurrency control.
 *
 * @public
 */
export type { ItemUpdateResult } from '../types/item.js';

/**
 * ItemRemoveResult - Item removal result
 *
 * Contains updated token after item removal.
 *
 * @public
 */
export type { ItemRemoveResult } from '../types/item.js';

// ============================================================================
// SCHEMA TYPES
// ============================================================================

/**
 * GroupSchema - Group schema definition
 *
 * Defines the structure of a group: what slots it contains and their schemas.
 *
 * @public
 */
export type { GroupSchema } from '../types/schema.js';

/**
 * NodeSchema - Node schema definition
 *
 * Defines the structure of a node: metadata fields and sections.
 *
 * @public
 */
export type { NodeSchema } from '../types/schema.js';

/**
 * SlotDef - Slot definition within group schema
 *
 * Declares a node slot and its schema reference.
 *
 * @public
 */
export type { SlotDef } from '../types/schema.js';

/**
 * SectionDef - Section definition within node schema
 *
 * Declares a static section with ID and content type.
 *
 * @public
 */
export type { SectionDef } from '../types/schema.js';

/**
 * DynamicSectionDef - Dynamic section definition
 *
 * Declares sections matching a pattern with optional min count.
 *
 * @public
 */
export type { DynamicSectionDef } from '../types/schema.js';

/**
 * FieldDef - Metadata field definition
 *
 * Defines field type, required flag, enum values, and description.
 *
 * @public
 */
export type { FieldDef } from '../types/schema.js';

/**
 * SchemaDescription - Schema inspection result
 *
 * Contains schema definition and metadata for introspection.
 *
 * @public
 */
export type { SchemaDescription } from '../types/schema.js';

/**
 * ValidationResult - Node validation result
 *
 * Contains validation outcome for a single node.
 *
 * @public
 */
export type { ValidationResult } from '../types/schema.js';

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * SidechainConfig - Store configuration
 *
 * Defines backend, mounts, schemas, and content types for store creation.
 *
 * @public
 */
export type { SidechainConfig } from '../types/config.js';

/**
 * MountDef - Mount configuration
 *
 * Maps a logical mount ID to a physical path with schema constraint.
 *
 * @public
 */
export type { MountDef } from '../types/config.js';

// ============================================================================
// CONTROL PLANE TYPES
// ============================================================================

/**
 * ControlPlane - Store introspection interface
 *
 * Provides access to store metadata: mounts, content types, info.
 *
 * @public
 */
export type { ControlPlane } from '../types/control-plane.js';

/**
 * StoreInfo - Store metadata
 *
 * Contains backend type, token salt, and configuration info.
 *
 * @public
 */
export type { StoreInfo } from '../types/control-plane.js';

/**
 * MountEntry - Mount registry entry
 *
 * Describes a mounted filesystem path with schema constraint.
 *
 * @public
 */
export type { MountEntry } from '../types/control-plane.js';

/**
 * ContentTypeEntry - Content type registry entry
 *
 * Describes a registered content type with serialize/deserialize functions.
 *
 * @public
 */
export type { ContentTypeEntry } from '../types/control-plane.js';

// ============================================================================
// CLIENT TYPES
// ============================================================================

/**
 * MappingEntry - Name-to-address mapping entry
 *
 * Contains address and creation timestamp for a friendly name.
 *
 * @public
 */
export type { MappingEntry } from './client.js';

/**
 * MappingFile - Mapping file format
 *
 * JSON structure storing all name-to-address mappings.
 *
 * @public
 */
export type { MappingFile } from './client.js';

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * SidechainError - Base error class
 *
 * All sidechain errors extend this base class with consistent structure.
 *
 * @public
 */
export type { SidechainError } from './errors.js';

/**
 * NotFoundError - Resource not found
 *
 * Thrown when group, node, or section does not exist.
 *
 * @public
 */
export type { NotFoundError } from './errors.js';

/**
 * ValidationError - Schema validation failure
 *
 * Thrown when node data fails schema constraints.
 *
 * @public
 */
export type { ValidationError } from './errors.js';

/**
 * SchemaNotFoundError - Schema not registered
 *
 * Thrown when referencing unregistered schema ID.
 *
 * @public
 */
export type { SchemaNotFoundError } from './errors.js';

/**
 * InvalidSchemaError - Malformed schema definition
 *
 * Thrown when schema structure is invalid.
 *
 * @public
 */
export type { InvalidSchemaError } from './errors.js';

/**
 * StaleTokenError - Optimistic concurrency conflict
 *
 * Thrown when write token does not match current content state.
 * Contains current state for retry without re-reading.
 *
 * @public
 */
export type { StaleTokenError } from './errors.js';

/**
 * PatternMismatchError - Dynamic section pattern mismatch
 *
 * Thrown when section ID does not match dynamic pattern.
 *
 * @public
 */
export type { PatternMismatchError } from './errors.js';

/**
 * SectionNotFoundError - Section not found
 *
 * Thrown when accessing non-existent section.
 *
 * @public
 */
export type { SectionNotFoundError } from './errors.js';

/**
 * NameNotFoundError - Name mapping not found
 *
 * Thrown by Client when friendly name has no address mapping.
 *
 * @public
 */
export type { NameNotFoundError } from './errors.js';

/**
 * MappingError - Mapping file error
 *
 * Thrown when mapping file is unreadable, unwritable, or has conflicts.
 *
 * @public
 */
export type { MappingError } from './errors.js';

// ============================================================================
// ADVANCED / INTERNAL EXPORTS
// ============================================================================

/**
 * [INTERNAL] ParsedPath - Parsed hierarchical path
 *
 * Internal representation of path components.
 * Exported for testing and internal use only.
 *
 * @internal
 */
export type { ParsedPath } from './addressing.js';

/**
 * [INTERNAL] parsePath - Parse hierarchical path
 *
 * Internal utility for path parsing.
 * Exported for testing and cross-module use only.
 *
 * @internal
 */
export { parsePath } from './addressing.js';

/**
 * [INTERNAL] slugify - Convert text to URL-safe slug
 *
 * Internal utility for generating section IDs.
 * Exported for testing and utility use only.
 *
 * @internal
 */
export { slugify } from './addressing.js';

/**
 * [INTERNAL] AddressResolver - Address resolution interface
 *
 * Internal interface for client address resolution.
 * Exported for testing implementations only.
 *
 * @internal
 */
export type { AddressResolver } from './addressing.js';

/**
 * [INTERNAL] InMemoryAddressResolver - Test address resolver
 *
 * Internal implementation for testing without filesystem.
 * Exported for test use only.
 *
 * @internal
 */
export { InMemoryAddressResolver } from './addressing.js';

/**
 * [INTERNAL] isValidGroupAddress - Validate group address format
 *
 * Internal utility for address validation.
 * Exported for testing and validation use only.
 *
 * @internal
 */
export { isValidGroupAddress } from './addressing.js';

/**
 * [INTERNAL] generateGroupAddress - Generate cryptographic group address
 *
 * Internal utility for address generation.
 * Exported for testing and backend use only.
 *
 * @internal
 */
export { generateGroupAddress } from './addressing.js';

/**
 * [INTERNAL] SchemaRegistry - Schema storage and validation
 *
 * Internal class managing schema registration and retrieval.
 * Exported for testing and store implementation only.
 *
 * @internal
 */
export { SchemaRegistry } from './schema.js';

/**
 * [INTERNAL] validateMetadataField - Field-level metadata validation
 *
 * Internal utility for metadata field validation.
 * Exported for testing and validation use only.
 *
 * @internal
 */
export { validateMetadataField } from './schema.js';

/**
 * [INTERNAL] validateMetadata - Node metadata validation
 *
 * Internal utility for complete metadata validation.
 * Exported for testing and store implementation only.
 *
 * @internal
 */
export { validateMetadata } from './schema.js';

/**
 * [INTERNAL] matchDynamicPattern - Pattern matching for dynamic sections
 *
 * Internal utility for dynamic section ID validation.
 * Exported for testing and validation use only.
 *
 * @internal
 */
export { matchDynamicPattern } from './schema.js';

/**
 * [INTERNAL] validateDynamicSectionId - Validate against pattern
 *
 * Internal utility throwing PatternMismatchError on failure.
 * Exported for testing and validation use only.
 *
 * @internal
 */
export { validateDynamicSectionId } from './schema.js';

/**
 * [INTERNAL] validateDynamicSectionMin - Validate minimum count
 *
 * Internal utility for dynamic section count validation.
 * Exported for testing and validation use only.
 *
 * @internal
 */
export { validateDynamicSectionMin } from './schema.js';

/**
 * [INTERNAL] checkSchemaDrift - Detect schema version mismatch
 *
 * Internal utility for schema drift detection.
 * Exported for testing and validation use only.
 *
 * @internal
 */
export { checkSchemaDrift } from './schema.js';

/**
 * [INTERNAL] TokenMode - Token enforcement mode
 *
 * Internal type for token validation mode.
 * Exported for configuration and testing only.
 *
 * @internal
 */
export type { TokenMode } from './tokens.js';

/**
 * [INTERNAL] generateNodeToken - Generate node-scoped token
 *
 * Internal utility for token generation.
 * Exported for testing and store implementation only.
 *
 * @internal
 */
export { generateNodeToken } from './tokens.js';

/**
 * [INTERNAL] generateSectionToken - Generate section-scoped token
 *
 * Internal utility for token generation.
 * Exported for testing and store implementation only.
 *
 * @internal
 */
export { generateSectionToken } from './tokens.js';

/**
 * [INTERNAL] validateToken - Validate token against content
 *
 * Internal utility for optimistic concurrency validation.
 * Exported for testing and store implementation only.
 *
 * @internal
 */
export { validateToken } from './tokens.js';

/**
 * [INTERNAL] generateSalt - Generate random token salt
 *
 * Internal utility for store initialization.
 * Exported for testing and store creation only.
 *
 * @internal
 */
export { generateSalt } from './tokens.js';

// ============================================================================
// USAGE GUIDELINES
// ============================================================================

/**
 * PUBLIC API USAGE
 *
 * External consumers should:
 * 1. Use Sidechain.open() to create stores
 * 2. Use Client for name-to-address resolution
 * 3. Operate against Store interface for all operations
 * 4. Use error classes for error handling
 * 5. Define schemas using GroupSchema and NodeSchema types
 *
 * INTERNAL API USAGE
 *
 * Exports marked [INTERNAL] are:
 * 1. Subject to breaking changes without major version bump
 * 2. Intended for testing or internal cross-module communication
 * 3. Not covered by semantic versioning guarantees
 * 4. May be removed or changed in minor releases
 *
 * If you need an [INTERNAL] export for production use, file an issue
 * requesting it be promoted to public API with stability guarantees.
 */
