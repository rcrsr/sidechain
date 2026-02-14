/**
 * Backend contract definition
 *
 * All backends implement the Backend interface for raw persistence operations.
 * The Store layer resolves addresses to physical paths before calling backend methods.
 * Schema validation and content type operations run in Store layer above Backend.
 *
 * Backend Contract (§CORE.1):
 * - createGroup(resolvedPath, slots) -> materializes directory with slot files [IR-25]
 * - deleteGroup(resolvedPath) -> removes group directory [IR-26]
 * - listGroups(mountPath) -> returns group entries [IR-27]
 * - readNode(resolvedPath, slot) -> returns raw node data [IR-28]
 * - writeNode(resolvedPath, slot, data) -> persists raw node data [IR-29]
 * - exists(resolvedPath, slot?) -> checks existence [IR-30]
 *
 * Backends handle raw persistence only; no schema validation.
 */

export type {
  Backend,
  GroupEntry,
  GroupMeta,
  RawNode,
  SlotDef,
} from '../types/backend.js';
