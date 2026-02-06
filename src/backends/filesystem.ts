/**
 * Filesystem backend implementation
 * Covers: IR-25, IR-26, IR-27, IR-28, IR-29, IR-30, IC-9
 *
 * Implements Backend interface for file-based storage.
 * Conventions:
 * - Metadata: YAML frontmatter (--- delimited)
 * - Sections: ## (h2) headings
 * - File extension: from config nodeExtension (default: .md)
 *
 * Backend Contract (§CORE.1):
 * - createGroup: create directory, write slot files with default frontmatter [IR-25]
 * - deleteGroup: remove directory and all contents [IR-26]
 * - listGroups: enumerate subdirectories in mount path [IR-27]
 * - readNode: parse markdown file into RawNode (frontmatter + sections) [IR-28]
 * - writeNode: serialize RawNode to markdown file [IR-29]
 * - exists: check file/directory existence [IR-30]
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import type { Backend, GroupEntry, RawNode, SlotDef } from './interface.js';

/**
 * Filesystem backend configuration
 */
export interface FilesystemBackendConfig {
  nodeExtension?: string;
}

/**
 * Filesystem backend implementation
 */
export class FilesystemBackend implements Backend {
  private readonly extension: string;

  constructor(config: FilesystemBackendConfig = {}) {
    this.extension = config.nodeExtension ?? '.md';
  }

  /**
   * Create a new group directory with slot files
   * IR-25: createGroup(resolvedPath, slots)
   *
   * Creates directory at resolvedPath
   * For each slot in slots[], creates file {resolvedPath}/{slot.id}{extension}
   * Writes default frontmatter: ---\nschema-id: {slot.schema}\n---\n
   * No sections by default (empty file after frontmatter)
   */
  async createGroup(resolvedPath: string, slots: SlotDef[]): Promise<void> {
    // Create directory
    await fs.mkdir(resolvedPath, { recursive: true });

    // Create slot files with default frontmatter
    for (const slot of slots) {
      const filePath = path.join(resolvedPath, `${slot.id}${this.extension}`);
      const metadata = { 'schema-id': slot.schema };
      const content = this.serializeNode({ metadata, sections: {} });
      await fs.writeFile(filePath, content, 'utf-8');
    }
  }

  /**
   * Delete a group and all its contents
   * IR-26: deleteGroup(resolvedPath)
   *
   * Removes directory and all slot files
   */
  async deleteGroup(resolvedPath: string): Promise<void> {
    await fs.rm(resolvedPath, { recursive: true, force: true });
  }

  /**
   * List all groups in a mount
   * IR-27: listGroups(mountPath)
   *
   * Enumerates subdirectories in mount path
   * Returns group entries with id and schema from first slot file
   */
  async listGroups(mountPath: string): Promise<GroupEntry[]> {
    const entries: GroupEntry[] = [];

    try {
      const items = await fs.readdir(mountPath, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          // Read first slot file to get schema
          const groupPath = path.join(mountPath, item.name);
          const groupFiles = await fs.readdir(groupPath);
          const firstSlotFile = groupFiles.find((f) =>
            f.endsWith(this.extension)
          );

          if (firstSlotFile !== undefined) {
            const slotPath = path.join(groupPath, firstSlotFile);
            const node = await this.readNodeFromFile(slotPath);
            const schemaId = node.metadata['schema-id'];

            entries.push({
              id: item.name,
              schema: typeof schemaId === 'string' ? schemaId : '',
            });
          }
        }
      }
    } catch (error) {
      // Mount path doesn't exist or can't be read - return empty array
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    return entries;
  }

  /**
   * Read a node's raw data
   * IR-28: readNode(resolvedPath, slot)
   *
   * Reads file at {resolvedPath}/{slot}{extension}
   * Parses YAML frontmatter (everything between first --- pair)
   * Splits remaining content on ## to extract sections
   * Returns { metadata, sections } where sections map heading slugs to content
   */
  async readNode(resolvedPath: string, slot: string): Promise<RawNode> {
    const filePath = path.join(resolvedPath, `${slot}${this.extension}`);
    return await this.readNodeFromFile(filePath);
  }

  /**
   * Write a node's raw data
   * IR-29: writeNode(resolvedPath, slot, data)
   *
   * Serializes frontmatter as YAML between --- markers
   * Serializes sections as ## Heading\n{content}\n\n blocks
   * Writes to {resolvedPath}/{slot}{extension}
   */
  async writeNode(
    resolvedPath: string,
    slot: string,
    data: RawNode
  ): Promise<void> {
    const filePath = path.join(resolvedPath, `${slot}${this.extension}`);
    const content = this.serializeNode(data);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Check if a group or node exists
   * IR-30: exists(resolvedPath, slot?)
   *
   * If slot provided, checks for specific node file
   * Otherwise checks for group directory
   */
  async exists(resolvedPath: string, slot?: string): Promise<boolean> {
    try {
      const targetPath =
        slot !== undefined
          ? path.join(resolvedPath, `${slot}${this.extension}`)
          : resolvedPath;

      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read and parse node from file path
   * Internal helper for readNode and listGroups
   */
  private async readNodeFromFile(filePath: string): Promise<RawNode> {
    const content = await fs.readFile(filePath, 'utf-8');
    return this.parseNode(content);
  }

  /**
   * Parse markdown content into RawNode
   *
   * Frontmatter: YAML between --- markers at start of file
   * Sections: Split on ## (h2 headings)
   * Section ID: Slug from heading text (lowercase, spaces to hyphens, strip special chars)
   * Returns sections as Record<string, string> mapping section ID to content
   */
  private parseNode(content: string): RawNode {
    // Parse frontmatter
    const frontmatterMatch = /^---\n([\s\S]*?)\n---\n/m.exec(content);
    let metadata: Record<string, unknown> = {};
    let bodyContent = content;

    if (frontmatterMatch !== null) {
      const yamlContent = frontmatterMatch[1];
      if (yamlContent !== undefined && yamlContent.trim() !== '') {
        try {
          const parsed: unknown = parseYaml(yamlContent);
          metadata =
            typeof parsed === 'object' && parsed !== null
              ? (parsed as Record<string, unknown>)
              : {};
        } catch {
          // Invalid YAML - use empty metadata
          metadata = {};
        }
      }
      // Remove frontmatter from body
      bodyContent = content.slice(frontmatterMatch[0].length);
    }

    // Parse sections into Record<string, string>
    const sections: Record<string, string> = {};
    const sectionRegex = /^## (.+)$/gm;
    const matches = Array.from(bodyContent.matchAll(sectionRegex));

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      if (match?.index === undefined) {
        continue;
      }

      const heading = match[1];
      if (heading === undefined) {
        continue;
      }

      const sectionId = this.slugify(heading);
      const startIndex = match.index + match[0].length + 1; // +1 for newline

      // Find end of section (next ## or end of content)
      const nextMatch = matches[i + 1];
      const endIndex = nextMatch?.index ?? bodyContent.length;

      const sectionContent = bodyContent.slice(startIndex, endIndex).trim();

      // Store section content as string
      sections[sectionId] = sectionContent;
    }

    return { metadata, sections };
  }

  /**
   * Serialize RawNode to markdown content
   *
   * Frontmatter: YAML between --- markers
   * Sections: ## Heading\n{content}\n\n blocks
   * Sections are Record<string, string> mapping section ID to content string
   */
  private serializeNode(data: RawNode): string {
    const parts: string[] = [];

    // Serialize frontmatter
    const yamlResult = stringifyYaml(data.metadata);
    const yamlContent = typeof yamlResult === 'string' ? yamlResult.trim() : '';
    parts.push('---');
    parts.push(yamlContent);
    parts.push('---');
    parts.push('');

    // Serialize sections from Record<string, string>
    for (const [sectionId, content] of Object.entries(data.sections)) {
      // Convert slug back to heading
      const heading = this.unslugify(sectionId);
      parts.push(`## ${heading}`);
      parts.push('');

      if (content.trim() !== '') {
        parts.push(content.trim());
        parts.push('');
      }
    }

    return parts.join('\n');
  }

  /**
   * Convert heading text to section ID slug
   *
   * Algorithm:
   * - Lowercase
   * - Spaces to hyphens
   * - Strip special characters
   * - Must be deterministic
   *
   * Example: "Functional Requirements" → "functional-requirements"
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // Spaces to hyphens
      .replace(/[^a-z0-9-]/g, '') // Strip special chars
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Convert section ID slug back to heading
   *
   * Algorithm:
   * - Replace hyphens with spaces
   * - Title case each word
   *
   * Note: This conversion is lossy. "API Design" → "api-design" → "Api Design"
   * This is acceptable per spec - only content matters, not exact heading capitalization.
   */
  private unslugify(slug: string): string {
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
