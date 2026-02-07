// Entry point
export { Sidechain } from './store.js';

// Client layer
export type { MappingEntry, MappingFile } from './client.js';
export { Client } from './client.js';

// Session layer
export type { Session } from '../types/session.js';
export { Session as SessionImpl } from './session.js';

// Store interface and key types
export type {
  GroupDescription,
  GroupEntry,
  GroupResult,
  GroupValidation,
  NodeResponse,
  Result,
  SlotEntry,
  Store,
} from '../types/store.js';

// Metadata types
export type {
  MetaReadResult,
  MetaResult,
  TokenOpts,
} from '../types/metadata.js';

// Section types
export type {
  PopulateData,
  SectionResponse,
  SectionSummary,
} from '../types/section.js';

// Item types
export type {
  ItemAddResult,
  ItemOps,
  ItemRemoveResult,
  ItemResponse,
  ItemUpdateResult,
} from '../types/item.js';

// Schema types
export type {
  DynamicSectionDef,
  FieldDef,
  GroupSchema,
  NodeSchema,
  SchemaDescription,
  SectionDef,
  SlotDef,
  ValidationResult,
} from '../types/schema.js';

// Control plane types
export type {
  ContentTypeEntry,
  ControlPlane,
  MountEntry,
  StoreInfo,
} from '../types/control-plane.js';

// Config types
export type { MountDef, SidechainConfig } from '../types/config.js';

// Error classes
export {
  InvalidSchemaError,
  MappingError,
  NameNotFoundError,
  NotFoundError,
  PatternMismatchError,
  SchemaNotFoundError,
  SectionNotFoundError,
  SidechainError,
  StaleTokenError,
  ValidationError,
} from './errors.js';

// Utility exports for advanced use cases (all marked [INTERNAL] in api-manifest.ts)

// Addressing utilities
export type { AddressResolver, ParsedPath } from './addressing.js';
export {
  generateGroupAddress,
  InMemoryAddressResolver,
  isValidGroupAddress,
  parsePath,
  slugify,
} from './addressing.js';

// Schema utilities
export {
  checkSchemaDrift,
  matchDynamicPattern,
  SchemaRegistry,
  validateDynamicSectionId,
  validateDynamicSectionMin,
  validateMetadata,
  validateMetadataField,
} from './schema.js';

// Token utilities
export type { TokenMode } from './tokens.js';
export {
  generateNodeToken,
  generateSalt,
  generateSectionToken,
  validateToken,
} from './tokens.js';
