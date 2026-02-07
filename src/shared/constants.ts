/**
 * Shared constants for Sidechain
 * Covers: IR-13, IC-8, AC-41
 *
 * Centralizes magic strings to prevent inconsistencies across modules.
 */

/**
 * Token prefix for node-level tokens (covers all metadata + sections)
 */
export const TOKEN_PREFIX_NODE = 'sc_t_node_';

/**
 * Token prefix for section-level tokens (covers single section content)
 */
export const TOKEN_PREFIX_SECTION = 'sc_t_sec_';

/**
 * Prefix for cryptographic group addresses
 * Format: sc_g_<hex-hash>
 */
export const GROUP_ADDRESS_PREFIX = 'sc_g_';

/**
 * MCP protocol version string
 * Indicates compatibility level for JSON-RPC 2.0 tools API
 */
export const MCP_PROTOCOL_VERSION = '2024-11-05';

/**
 * Default configuration file name
 * Used when no explicit --config path provided
 */
export const DEFAULT_CONFIG_FILE = 'sidechain.json';

/**
 * Default file extension for node serialization
 * Used by filesystem backend when nodeExtension not specified in config
 */
export const DEFAULT_NODE_EXTENSION = '.md';
