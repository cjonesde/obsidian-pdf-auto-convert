# PDF Auto Converter

Automatically convert PDF files (.pdf) to Markdown when added to your Obsidian vault.

## Installation

### From Releases (Recommended)

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/wuhup/obsidian-pdf-auto-convert/releases/latest)
2. Create a folder called `pdf-auto-convert` in your vault's `.obsidian/plugins/` directory
3. Copy `main.js` and `manifest.json` into that folder
4. Restart Obsidian
5. Go to Settings > Community plugins > Enable "PDF Auto Converter"

### From Source

```bash
git clone https://github.com/wuhup/obsidian-pdf-auto-convert.git
cd obsidian-pdf-auto-convert
npm install
npm run build
```

Then copy `main.js` and `manifest.json` to your vault's `.obsidian/plugins/pdf-auto-convert/` folder.

## Requirements

This plugin requires [Pandoc](https://pandoc.org/) to be installed on your system. For PDF input, Pandoc relies on Poppler utilities (such as `pdftotext`).

### Installing Pandoc

**macOS:**
```bash
brew install pandoc
```

**Windows:**
```bash
winget install pandoc
```
Or download from [pandoc.org/installing.html](https://pandoc.org/installing.html)

**Linux (Debian/Ubuntu):**
```bash
sudo apt install pandoc
```

### Installing Poppler (for PDF conversion)

**macOS:**
```bash
brew install poppler
```

**Windows:**
Install Poppler from a trusted package source and ensure `pdftotext` is on your PATH.

**Linux (Debian/Ubuntu):**
```bash
sudo apt install poppler-utils
```

## Features

- **Automatic conversion:** Drop a .pdf file into your vault and it is converted to Markdown
- **Image extraction:** Embedded images are extracted and saved to your attachment folder
- **Metadata preservation:** Title, author, dates, and keywords are added to YAML frontmatter when available
- **Respects Obsidian settings:** Uses your configured attachment folder location and link format (wiki links or markdown links)

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Pandoc path | Custom path to Pandoc executable (leave empty to use system PATH) | Empty |
| Enable automatic conversion | Toggle automatic conversion on or off | Enabled |
| Add frontmatter with metadata | Add YAML frontmatter with document metadata | Enabled |
| Delete original file | Delete the .pdf after conversion instead of moving to attachments | Disabled |

The settings page shows Pandoc status (installed or not found) and updates in real time when you change the path.

## How it works

1. When a .pdf file is added to your vault, the plugin detects it
2. The document is converted to Markdown using Pandoc
3. Embedded images are extracted and saved to your attachment folder
4. PDF metadata (when available) is added as YAML frontmatter
5. The original .pdf is either moved to your attachment folder or deleted (based on settings)
6. A new .md file is created in the same location as the original

## Frontmatter

When enabled, the plugin adds frontmatter like this:

```yaml
---
source: "[[attachments/document.pdf]]"
author: "John Doe"
created: 2025-01-15
modified: 2025-01-15
---
```

## Limitations

- Requires Pandoc to be installed and accessible in your system PATH
- Password-protected PDFs cannot be converted
- Scanned PDFs without embedded text will not convert without OCR
- Complex layouts may not convert perfectly
- Desktop only (not available on mobile)

## Troubleshooting

**"Pandoc is not installed" message:**
1. Install Pandoc using the instructions above
2. If Pandoc is installed but not detected, set the full path in settings:
   - **macOS/Linux:** Run `which pandoc` in Terminal and paste the result
   - **Windows:** Run `Get-Command pandoc` in PowerShell and use the Source path
3. Restart Obsidian if you installed Pandoc while it was running

**Images not appearing:**
Check that your attachment folder setting in Obsidian is configured correctly. Images are saved relative to this setting.

**Metadata missing:**
Install Poppler so `pdfinfo` is available. Metadata extraction is best-effort and depends on what is stored in the PDF.

## License

MIT
