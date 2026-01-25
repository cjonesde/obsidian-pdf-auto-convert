# PRD: Obsidian PDF Auto-Converter Plugin

**Version:** 1.1  
**Date:** January 2026  
**Status:** Draft

---

## 1. Overview

An Obsidian plugin that automatically converts `.pdf` files to Markdown when they appear anywhere in the vault. Zero configuration required. Original files are preserved as attachments and linked from the converted note.

---

## 2. Problem Statement

Users drop PDF documents into their vault expecting to work with them natively. Instead, they get unopenable binary files requiring manual external conversion. This breaks the "everything is Markdown" mental model.

---

## 3. Goals

| Goal | Metric |
|------|--------|
| Zero-touch conversion | No manual steps after file drop |
| High-fidelity output | Headings, lists, tables, formatting preserved |
| Complete image extraction | All embedded images retained |
| Non-destructive | Original .pdf always preserved and linked |
| Zero configuration | Works immediately after install |

---

## 4. Functional Requirements

### 4.1 Core Behavior

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Listen for `.pdf` file creation via Obsidian's `vault.on('create')` event | P0 |
| FR-02 | Convert .pdf to Markdown using marker-pdf | P0 |
| FR-03 | Place converted .md file in same folder as original .pdf | P0 |
| FR-04 | Move original .pdf to vault's configured attachment folder | P0 |
| FR-05 | Insert link to original .pdf in frontmatter or note header | P0 |
| FR-06 | Use Obsidian's existing attachment folder setting (no custom config) | P0 |

### 4.2 Content Conversion

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-10 | Preserve heading hierarchy (H1-H6) | P0 |
| FR-11 | Convert bullet and numbered lists (nested) | P0 |
| FR-12 | Convert tables with alignment | P0 |
| FR-13 | Preserve bold, italic, strikethrough | P0 |
| FR-14 | Convert hyperlinks | P0 |
| FR-15 | Convert footnotes to Markdown footnote syntax | P1 |
| FR-16 | Convert blockquotes | P1 |

### 4.3 Image Handling

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-20 | Extract all embedded images from .pdf | P0 |
| FR-21 | Save images to vault's attachment folder | P0 |
| FR-22 | Name images: `{docname}-{n}.{ext}` | P0 |
| FR-23 | Insert image embeds using vault's link format preference | P0 |
| FR-24 | Convert EMF/WMF to PNG | P1 |

### 4.4 Metadata Extraction

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-30 | Extract document title (use as note title if present) | P0 |
| FR-31 | Extract author -> frontmatter `author` property | P0 |
| FR-32 | Extract creation date -> frontmatter `created` property | P0 |
| FR-33 | Extract last modified date -> frontmatter `modified` property | P1 |
| FR-34 | Extract keywords/tags -> frontmatter `tags` property | P1 |

### 4.5 Settings

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-40 | Toggle: Enable/disable plugin | P0 |
| FR-41 | Toggle: Include frontmatter (default: on) | P1 |
| FR-42 | Toggle: Delete original after conversion instead of keeping | P2 |

### 4.6 Feedback

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-50 | Show Obsidian Notice on successful conversion | P0 |
| FR-51 | Show error Notice with reason on failure | P0 |
| FR-52 | Skip password-protected files with notification | P0 |

---

## 5. Technical Design

### 5.1 Obsidian Integration Points

| Obsidian API | Usage |
|--------------|-------|
| `vault.on('create', callback)` | Detect new .pdf files anywhere in vault |
| `vault.getConfig('attachmentFolderPath')` | Respect user's attachment folder setting |
| `vault.getConfig('useMarkdownLinks')` | Match user's link format preference |
| `vault.create(path, content)` | Write converted .md file |
| `vault.rename(file, newPath)` | Move .pdf to attachments |
| `vault.readBinary(file)` | Read .pdf contents |
| `FileSystemAdapter` | Write extracted images |
| `Notice` | User feedback |
| `Plugin.saveData/loadData` | Persist settings |

### 5.2 Conversion Flow

```
.pdf detected via vault.on('create')
         |
         v
   Read file as ArrayBuffer
         |
         v
   Parse with marker-pdf
         |
         |-> Extract images -> write to attachment folder
         |
         |-> Extract metadata from pdfinfo
         |
         v
   Generate Markdown with frontmatter
         |
         v
   vault.create() the .md file (same location as .pdf)
         |
         v
   vault.rename() .pdf -> attachment folder
         |
         v
   Show success Notice
```

### 5.3 Output Format

```markdown
---
source: "[[attachments/Original Document.pdf]]"
author: John Smith
created: 2025-12-15
modified: 2026-01-10
tags: [report, quarterly]
---

# Document Title

Content here...

![[Original Document-1.png]]

More content...
```

### 5.4 Key Implementation Notes

**Respecting Obsidian's attachment folder logic:**
Obsidian's attachment folder setting can be:
- A specific folder (e.g., `attachments/`)
- Same folder as current file (`./`)
- Subfolder under current file (e.g., `./assets`)

The plugin must read `vault.getConfig('attachmentFolderPath')` and resolve paths accordingly. Use `app.vault.getAvailablePathForAttachments()` if available.

**Link format:**
Check `vault.getConfig('useMarkdownLinks')`. If false, use wiki-links `![[image.png]]`. If true, use `![](path/image.png)`.

**Avoiding re-processing:**
After moving the .pdf to attachments, the `create` event fires again. Filter by checking if the new path is inside the attachment folder.

---

## 6. Settings UI

```
PDF Converter
--------------

[x] Enable automatic conversion

[x] Add frontmatter with metadata

[ ] Delete original .pdf after conversion
    (Default: Keep in attachments folder)
```

Three toggles. Nothing else.

---

## 7. Edge Cases

| Case | Handling |
|------|----------|
| Password-protected | Skip, show Notice |
| Corrupted file | Skip, show error Notice |
| Empty document | Create .md with frontmatter only |
| No metadata in source | Omit those frontmatter fields |
| Tracked changes | Use accepted version |
| File in attachment folder | Ignore (prevents loop) |
| Attachment setting is "same folder" | .pdf stays in place, linked via simple `[[file.pdf]]` |

---

## 8. Out of Scope

- Mobile platforms
- Manual/batch conversion UI
- Custom inbox folders
- Filename conflict handling
- ODT/ODF formats
- Two-way sync
- Custom templates

---

## 9. Launch Criteria

**v1.0:**
- All P0 requirements complete
- Tested on Windows and macOS
- Works with Obsidian 1.4.0+

---

*End of PRD*
