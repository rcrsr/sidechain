/**
 * Tests for filesystem backend
 * Covers: IR-25, IR-26, IR-27, IR-28, IR-29, IR-30, IC-9, AC-32, AC-33
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FilesystemBackend } from '../../src/backends/filesystem.js';
import type { RawNode, SlotDef } from '../../src/backends/interface.js';

describe('FilesystemBackend', () => {
  let backend: FilesystemBackend;
  let tempDir: string;

  beforeEach(async () => {
    backend = new FilesystemBackend({ nodeExtension: '.md' });
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sidechain-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('createGroup', () => {
    // IR-25: createGroup creates directory with slot files
    it('creates directory at resolved path', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      const slots: SlotDef[] = [
        { id: 'spec', schema: 'initiative-spec' },
        { id: 'plan', schema: 'initiative-plan' },
      ];

      await backend.createGroup(groupPath, slots);

      const stat = await fs.stat(groupPath);
      expect(stat.isDirectory()).toBe(true);
    });

    // IR-25: Slot files contain default frontmatter
    it('creates slot files with default frontmatter', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      const slots: SlotDef[] = [
        { id: 'spec', schema: 'initiative-spec' },
        { id: 'plan', schema: 'initiative-plan' },
      ];

      await backend.createGroup(groupPath, slots);

      // Check spec slot
      const specContent = await fs.readFile(
        path.join(groupPath, 'spec.md'),
        'utf-8'
      );
      expect(specContent).toContain('---');
      expect(specContent).toContain('schema-id: initiative-spec');

      // Check plan slot
      const planContent = await fs.readFile(
        path.join(groupPath, 'plan.md'),
        'utf-8'
      );
      expect(planContent).toContain('---');
      expect(planContent).toContain('schema-id: initiative-plan');
    });

    // AC-33: Empty slot file contains frontmatter only, no sections
    it('creates empty slot files with no sections', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      const slots: SlotDef[] = [{ id: 'spec', schema: 'initiative-spec' }];

      await backend.createGroup(groupPath, slots);

      const content = await fs.readFile(
        path.join(groupPath, 'spec.md'),
        'utf-8'
      );
      const lines = content.split('\n');

      // Should have frontmatter markers and schema-id
      expect(content).toMatch(/^---\n[\s\S]*?\n---\n/);

      // Should not have any section headers (##)
      const hasSection = lines.some((line) => line.trim().startsWith('## '));
      expect(hasSection).toBe(false);
    });

    // IR-25: Multiple slots created
    it('creates all slot files from definition', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      const slots: SlotDef[] = [
        { id: 'spec', schema: 'initiative-spec' },
        { id: 'plan', schema: 'initiative-plan' },
        { id: 'requirements', schema: 'requirements-doc' },
      ];

      await backend.createGroup(groupPath, slots);

      const files = await fs.readdir(groupPath);
      expect(files).toHaveLength(3);
      expect(files).toContain('spec.md');
      expect(files).toContain('plan.md');
      expect(files).toContain('requirements.md');
    });
  });

  describe('deleteGroup', () => {
    // IR-26: deleteGroup removes directory and all slot files
    it('removes group directory and all contents', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      const slots: SlotDef[] = [
        { id: 'spec', schema: 'initiative-spec' },
        { id: 'plan', schema: 'initiative-plan' },
      ];

      await backend.createGroup(groupPath, slots);

      // Verify it exists
      let exists = await backend.exists(groupPath);
      expect(exists).toBe(true);

      // Delete it
      await backend.deleteGroup(groupPath);

      // Verify it's gone
      exists = await backend.exists(groupPath);
      expect(exists).toBe(false);
    });

    // IR-26: Safe deletion of non-existent group
    it('handles deletion of non-existent group without error', async () => {
      const groupPath = path.join(tempDir, 'nonexistent-group');

      await expect(backend.deleteGroup(groupPath)).resolves.not.toThrow();
    });
  });

  describe('listGroups', () => {
    // IR-27: listGroups returns subdirectory names
    it('returns all group entries in mount path', async () => {
      const mountPath = tempDir;

      // Create multiple groups
      await backend.createGroup(path.join(mountPath, 'group-1'), [
        { id: 'spec', schema: 'schema-a' },
      ]);
      await backend.createGroup(path.join(mountPath, 'group-2'), [
        { id: 'spec', schema: 'schema-b' },
      ]);
      await backend.createGroup(path.join(mountPath, 'group-3'), [
        { id: 'spec', schema: 'schema-c' },
      ]);

      const groups = await backend.listGroups(mountPath);

      expect(groups).toHaveLength(3);
      expect(groups.map((g) => g.id)).toContain('group-1');
      expect(groups.map((g) => g.id)).toContain('group-2');
      expect(groups.map((g) => g.id)).toContain('group-3');
    });

    // IR-27: Schema extracted from first slot file
    it('returns schema from first slot file', async () => {
      const mountPath = tempDir;

      await backend.createGroup(path.join(mountPath, 'test-group'), [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const groups = await backend.listGroups(mountPath);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.id).toBe('test-group');
      expect(groups[0]?.schema).toBe('initiative-spec');
    });

    // IR-27: Empty mount path returns empty array
    it('returns empty array for non-existent mount path', async () => {
      const mountPath = path.join(tempDir, 'nonexistent-mount');

      const groups = await backend.listGroups(mountPath);

      expect(groups).toEqual([]);
    });

    // IR-27: Empty mount path returns empty array
    it('returns empty array for empty mount path', async () => {
      const mountPath = path.join(tempDir, 'empty-mount');
      await fs.mkdir(mountPath);

      const groups = await backend.listGroups(mountPath);

      expect(groups).toEqual([]);
    });
  });

  describe('readNode', () => {
    // IR-28: readNode parses YAML frontmatter
    it('parses YAML frontmatter into metadata', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      // Manually write node with custom metadata
      const content = `---
schema-id: initiative-spec
status: draft
priority: high
---

`;
      await fs.writeFile(path.join(groupPath, 'spec.md'), content, 'utf-8');

      const node = await backend.readNode(groupPath, 'spec');

      expect(node.metadata['schema-id']).toBe('initiative-spec');
      expect(node.metadata['status']).toBe('draft');
      expect(node.metadata['priority']).toBe('high');
    });

    // IR-28: readNode parses ## sections
    it('parses h2 sections into sections array', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      // Manually write node with sections
      const content = `---
schema-id: initiative-spec
---

## Overview

This is the overview section.

## Requirements

These are the requirements.
- Item 1
- Item 2

## Design Notes

Design details here.
`;
      await fs.writeFile(path.join(groupPath, 'spec.md'), content, 'utf-8');

      const node = await backend.readNode(groupPath, 'spec');

      expect(Object.keys(node.sections)).toHaveLength(3);

      expect(node.sections['overview']).toBeDefined();
      expect(node.sections['overview']).toContain(
        'This is the overview section'
      );

      expect(node.sections['requirements']).toBeDefined();
      expect(node.sections['requirements']).toContain(
        'These are the requirements'
      );
      expect(node.sections['requirements']).toContain('- Item 1');

      expect(node.sections['design-notes']).toBeDefined();
      expect(node.sections['design-notes']).toContain('Design details here');
    });

    // IR-28: Section ID slugification
    it('converts heading text to slugified section IDs', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const content = `---
schema-id: initiative-spec
---

## Functional Requirements

Content here.

## Non-Functional Requirements

More content.

## API Design & Implementation

Details.
`;
      await fs.writeFile(path.join(groupPath, 'spec.md'), content, 'utf-8');

      const node = await backend.readNode(groupPath, 'spec');

      const sectionIds = Object.keys(node.sections);
      expect(sectionIds).toContain('functional-requirements');
      expect(sectionIds).toContain('non-functional-requirements');
      expect(sectionIds).toContain('api-design-implementation');
    });

    // IR-28: Empty sections allowed
    it('handles empty sections', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const content = `---
schema-id: initiative-spec
---

## Overview

## Requirements

Some content.
`;
      await fs.writeFile(path.join(groupPath, 'spec.md'), content, 'utf-8');

      const node = await backend.readNode(groupPath, 'spec');

      expect(node.sections['overview']).toBeDefined();
      expect(node.sections['overview']).toBe('');
    });

    // IR-28: No sections returns empty sections array
    it('returns empty sections array when no sections present', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const node = await backend.readNode(groupPath, 'spec');

      expect(node.sections).toEqual({});
    });
  });

  describe('writeNode', () => {
    // IR-29: writeNode serializes frontmatter + sections
    it('serializes metadata as YAML frontmatter', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const node: RawNode = {
        metadata: {
          'schema-id': 'initiative-spec',
          status: 'draft',
          priority: 'high',
        },
        sections: {},
      };

      await backend.writeNode(groupPath, 'spec', node);

      const content = await fs.readFile(
        path.join(groupPath, 'spec.md'),
        'utf-8'
      );

      expect(content).toContain('---');
      expect(content).toContain('schema-id: initiative-spec');
      expect(content).toContain('status: draft');
      expect(content).toContain('priority: high');
    });

    // IR-29: writeNode serializes sections as ## blocks
    it('serializes sections as h2 markdown blocks', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const node: RawNode = {
        metadata: { 'schema-id': 'initiative-spec' },
        sections: {
          overview: 'This is the overview section.',
          requirements: 'These are the requirements.',
        },
      };

      await backend.writeNode(groupPath, 'spec', node);

      const content = await fs.readFile(
        path.join(groupPath, 'spec.md'),
        'utf-8'
      );

      expect(content).toContain('## Overview');
      expect(content).toContain('This is the overview section.');
      expect(content).toContain('## Requirements');
      expect(content).toContain('These are the requirements.');
    });

    // AC-32: Round-trip produces identical RawNode
    it('preserves data through write-read round trip', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const original: RawNode = {
        metadata: {
          'schema-id': 'initiative-spec',
          status: 'draft',
          priority: 'high',
          tags: ['important', 'urgent'],
        },
        sections: {
          overview: 'Overview content here.',
          requirements: 'Requirements content.\n\n- Item 1\n- Item 2',
        },
      };

      await backend.writeNode(groupPath, 'spec', original);
      const retrieved = await backend.readNode(groupPath, 'spec');

      expect(retrieved.metadata).toEqual(original.metadata);
      expect(Object.keys(retrieved.sections)).toHaveLength(
        Object.keys(original.sections).length
      );

      for (const [sectionId, content] of Object.entries(original.sections)) {
        expect(retrieved.sections[sectionId]).toBeDefined();
        expect(retrieved.sections[sectionId]).toBe(content);
      }
    });

    // IR-29: Complex metadata types
    it('handles complex metadata types', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const node: RawNode = {
        metadata: {
          'schema-id': 'initiative-spec',
          count: 42,
          enabled: true,
          tags: ['tag1', 'tag2'],
          nested: { key: 'value' },
        },
        sections: {},
      };

      await backend.writeNode(groupPath, 'spec', node);
      const retrieved = await backend.readNode(groupPath, 'spec');

      expect(retrieved.metadata['count']).toBe(42);
      expect(retrieved.metadata['enabled']).toBe(true);
      expect(retrieved.metadata['tags']).toEqual(['tag1', 'tag2']);
      expect(retrieved.metadata['nested']).toEqual({ key: 'value' });
    });
  });

  describe('exists', () => {
    // IR-30: exists returns true for existing group
    it('returns true for existing group directory', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const exists = await backend.exists(groupPath);

      expect(exists).toBe(true);
    });

    // IR-30: exists returns false for missing group
    it('returns false for non-existent group directory', async () => {
      const groupPath = path.join(tempDir, 'nonexistent-group');

      const exists = await backend.exists(groupPath);

      expect(exists).toBe(false);
    });

    // IR-30: exists returns true for existing slot
    it('returns true for existing node slot', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const exists = await backend.exists(groupPath, 'spec');

      expect(exists).toBe(true);
    });

    // IR-30: exists returns false for missing slot
    it('returns false for non-existent node slot', async () => {
      const groupPath = path.join(tempDir, 'test-group');
      await backend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const exists = await backend.exists(groupPath, 'nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('configuration', () => {
    // IC-9: Custom node extension
    it('uses custom node extension from config', async () => {
      const customBackend = new FilesystemBackend({ nodeExtension: '.txt' });
      const groupPath = path.join(tempDir, 'test-group');

      await customBackend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const files = await fs.readdir(groupPath);
      expect(files).toContain('spec.txt');
      expect(files).not.toContain('spec.md');
    });

    // IC-9: Default extension is .md
    it('defaults to .md extension when not configured', async () => {
      const defaultBackend = new FilesystemBackend();
      const groupPath = path.join(tempDir, 'test-group');

      await defaultBackend.createGroup(groupPath, [
        { id: 'spec', schema: 'initiative-spec' },
      ]);

      const files = await fs.readdir(groupPath);
      expect(files).toContain('spec.md');
    });
  });
});
