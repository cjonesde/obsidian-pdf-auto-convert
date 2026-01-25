# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that automatically converts .pdf files to Markdown when dropped into a vault. It uses marker-pdf for conversion and Poppler's `pdfinfo` for metadata and password checks. Image extraction and metadata handling are performed after marker-pdf runs.

## Build Commands

```bash
npm run dev          # Start development build with watch mode
npm run build        # Production build (outputs main.js)
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm test -- path-resolver.test.ts   # Run single test file
```

## Architecture

The plugin follows a modular design with clear separation of concerns:

```
src/
|-- main.ts           # Plugin entry point, event handling, orchestration
|-- converter.ts      # Marker integration, markdown generation, frontmatter
|-- image-handler.ts  # Extracted media handling from conversion output
|-- metadata.ts       # pdfinfo parsing for metadata
|-- path-resolver.ts  # Obsidian attachment path resolution logic
|-- settings.ts       # Settings tab UI (PluginSettingTab)
`-- types.ts          # All TypeScript interfaces
```

**Data Flow:**
1. `main.ts` detects `.pdf` file creation via `vault.on('create')`
2. `converter.ts` calls marker-pdf and returns raw Markdown plus extracted media
3. `image-handler.ts` collects extracted images from marker-pdf output
4. `path-resolver.ts` calculates where images/PDF should be stored (respects Obsidian's attachment folder setting)
5. `metadata.ts` parses pdfinfo output for author/dates/tags
6. Final Markdown with frontmatter is written to the vault

**Key Design Decisions:**
- Uses `onLayoutReady()` to defer event registration, preventing conversion of existing files during vault load
- Skips files already in attachment folder to prevent infinite loops
- Skips conversion if corresponding `.md` already exists
- Creates temp files for marker-pdf (it requires file paths, not buffers)

## Testing

Tests use Jest with manual Obsidian mocks in `src/__mocks__/obsidian.ts`. The mocks provide a `createMockApp()` helper for setting up vault/adapter mocks.

## External Dependency

Requires marker-pdf installed on the system. The plugin checks marker-pdf availability on load and shows a notice if missing. Users can configure a custom marker path in settings.
