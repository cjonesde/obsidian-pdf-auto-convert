/**
 * Converter backend type.
 * - 'marker': Use marker-pdf (ML-based, best quality, heavy on resources)
 * - 'pdftotext': Use poppler's pdftotext (lightweight, layout-preserving text only)
 * - 'auto': Try marker first, fall back to pdftotext on timeout/resource errors
 */
export type ConverterType = 'marker' | 'pdftotext' | 'auto';

/**
 * Plugin settings interface
 */
export interface PdfConverterSettings {
  /** Enable/disable automatic conversion */
  enabled: boolean;
  /** Include frontmatter with metadata */
  includeFrontmatter: boolean;
  /** Delete original .pdf after conversion instead of keeping */
  deleteOriginal: boolean;
  /** Custom path to Marker executable (empty = use PATH) */
  markerPath: string;
  /** Maximum time in seconds to allow a conversion to run */
  conversionTimeout: number;
  /** File size in MB above which auto-conversion is skipped (user directed to right-click) */
  fileSizeWarningMB: number;
  /** Which converter backend to use */
  converter: ConverterType;
  /** Custom path to pdftotext executable (empty = use PATH) */
  pdftotextPath: string;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: PdfConverterSettings = {
  enabled: true,
  includeFrontmatter: true,
  deleteOriginal: false,
  markerPath: '',
  conversionTimeout: 120,
  fileSizeWarningMB: 50,
  converter: 'marker',
  pdftotextPath: '',
};

/**
 * Extracted document metadata
 */
export interface DocumentMetadata {
  title?: string;
  author?: string;
  created?: string;
  modified?: string;
  tags?: string[];
}

/**
 * Extracted image information
 */
export interface ExtractedImage {
  /** Original content type from the PDF */
  contentType: string;
  /** Source path from the PDF (e.g., "media/image1.png") */
  sourcePath: string;
  /** Suggested filename (e.g., "document-1.png") */
  filename: string;
  /** Raw image data */
  data: ArrayBuffer;
}

/**
 * Result of the conversion process
 */
export interface ConversionResult {
  /** The converted Markdown content */
  markdown: string;
  /** Extracted document metadata */
  metadata: DocumentMetadata;
  /** Extracted images */
  images: ExtractedImage[];
  /** Any warnings during conversion */
  warnings: string[];
}

/**
 * Options for path resolution
 */
export interface PathResolutionOptions {
  /** The attachment folder setting from Obsidian */
  attachmentFolderPath: string;
  /** Whether to use Markdown links (true) or wiki links (false) */
  useMarkdownLinks: boolean;
  /** The path of the source file */
  sourceFilePath: string;
}
