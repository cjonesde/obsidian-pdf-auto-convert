import * as fs from 'fs';
import * as path from 'path';
import { ExtractedImage } from './types';
import { sanitizeFilename } from './path-resolver';

/**
 * Map of file extensions to content types.
 */
const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
};

const IMAGE_EXTENSIONS = new Set(Object.keys(EXTENSION_TO_CONTENT_TYPE));

/**
 * Get content type from file extension.
 */
export function getContentTypeFromExtension(extension: string): string {
  return EXTENSION_TO_CONTENT_TYPE[extension.toLowerCase()] || 'image/png';
}

/**
 * Generate a filename for an extracted image.
 */
export function generateImageFilename(
  documentName: string,
  index: number,
  extension: string
): string {
  const safeName = sanitizeFilename(documentName);
  return `${safeName}-${index}.${extension}`;
}

function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

async function listFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await listFiles(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    return [];
  }

  return files;
}

/**
 * Collect extracted images from a conversion output directory.
 */
export async function collectExtractedImages(
  extractRoot: string,
  documentName: string,
  referenceRoot: string = extractRoot
): Promise<ExtractedImage[]> {
  const files = await listFiles(extractRoot);
  if (files.length === 0) {
    return [];
  }

  files.sort((a, b) => a.localeCompare(b));

  const images: ExtractedImage[] = [];
  let index = 1;

  for (const filePath of files) {
    const extension = path.extname(filePath).replace('.', '').toLowerCase();
    if (!extension || !IMAGE_EXTENSIONS.has(extension)) {
      continue;
    }

    const fileBuffer = await fs.promises.readFile(filePath);
    const data = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );
    const sourcePath = normalizeRelativePath(path.relative(referenceRoot, filePath));
    const filename = generateImageFilename(documentName, index, extension);
    const contentType = getContentTypeFromExtension(extension);

    images.push({
      contentType,
      sourcePath,
      filename,
      data,
    });

    index++;
  }

  return images;
}
