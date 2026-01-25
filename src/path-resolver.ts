import { normalizePath } from 'obsidian';

/**
 * Characters not allowed in filenames across platforms
 */
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;

/**
 * Sanitize a filename by removing invalid characters
 */
export function sanitizeFilename(filename: string): string {
  return filename.replace(INVALID_FILENAME_CHARS, '').trim();
}

/**
 * Get the parent folder path from a file path
 */
export function getParentFolder(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) {
    return '';
  }
  return filePath.substring(0, lastSlash);
}

/**
 * Get the filename from a path
 */
export function getFilename(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) {
    return filePath;
  }
  return filePath.substring(lastSlash + 1);
}

/**
 * Resolve the attachment path based on Obsidian's attachment folder setting.
 *
 * Obsidian's attachment folder setting can be:
 * - A specific folder (e.g., "attachments/")
 * - Same folder as current file ("./" or ".")
 * - Subfolder under current file (e.g., "./assets")
 * - Root folder ("" or "/")
 *
 * @param attachmentFolderPath The attachment folder setting from Obsidian
 * @param sourceFilePath The path of the source file being converted
 * @param filename The filename to place in the attachment folder
 * @returns The resolved path for the attachment
 */
export function resolveAttachmentPath(
  attachmentFolderPath: string,
  sourceFilePath: string,
  filename: string
): string {
  const sourceFolder = getParentFolder(sourceFilePath);

  // Handle root folder settings
  if (!attachmentFolderPath || attachmentFolderPath === '/') {
    return filename;
  }

  // Handle relative folder settings (same folder or subfolder)
  if (attachmentFolderPath.startsWith('./') || attachmentFolderPath === '.') {
    const relativePart = attachmentFolderPath === '.' || attachmentFolderPath === './'
      ? ''
      : attachmentFolderPath.substring(2); // Remove "./"

    if (!sourceFolder) {
      // Source is at root level
      return relativePart ? `${relativePart}/${filename}` : filename;
    }

    return relativePart
      ? normalizePath(`${sourceFolder}/${relativePart}/${filename}`)
      : normalizePath(`${sourceFolder}/${filename}`);
  }

  // Handle absolute folder path
  return normalizePath(`${attachmentFolderPath}/${filename}`);
}

/**
 * Generate an image embed link in either wiki or markdown format
 *
 * @param imagePath Path to the image file
 * @param useMarkdownLinks Whether to use markdown links (true) or wiki links (false)
 * @returns The formatted image embed
 */
export function generateImageLink(imagePath: string, useMarkdownLinks: boolean): string {
  if (useMarkdownLinks) {
    // Markdown format: ![alt](path)
    const encodedPath = imagePath.split('/').map(encodeURIComponent).join('/');
    return `![](${encodedPath})`;
  }

  // Wiki format: ![[path]]
  return `![[${imagePath}]]`;
}

/**
 * Generate a link to the original PDF file
 *
 * @param pdfPath Path to the PDF file
 * @param useMarkdownLinks Whether to use markdown links (true) or wiki links (false)
 * @returns The formatted link
 */
export function generatePdfLink(pdfPath: string, useMarkdownLinks: boolean): string {
  if (useMarkdownLinks) {
    // Markdown format: [text](path)
    const filename = getFilename(pdfPath);
    const encodedPath = pdfPath.split('/').map(encodeURIComponent).join('/');
    return `[${filename}](${encodedPath})`;
  }

  // Wiki format: [[path]]
  return `[[${pdfPath}]]`;
}

function containsSegmentSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || haystack.length < needle.length) {
    return false;
  }

  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let matches = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a path is inside the attachment folder
 *
 * @param filePath The file path to check
 * @param attachmentFolderPath The attachment folder setting
 * @returns True if the file is inside the attachment folder
 */
export function isInAttachmentFolder(
  filePath: string,
  attachmentFolderPath: string
): boolean {
  // Can't be in attachment folder if it's same folder or root
  if (!attachmentFolderPath || attachmentFolderPath === '/' ||
      attachmentFolderPath === '.' || attachmentFolderPath === './') {
    return false;
  }

  const normalizedFilePath = normalizePath(filePath);

  if (attachmentFolderPath.startsWith('./')) {
    const relativePart = attachmentFolderPath.substring(2);
    const normalizedRelative = normalizePath(relativePart).replace(/^\/+|\/+$/g, '');
    if (!normalizedRelative) {
      return false;
    }

    const relativeSegments = normalizedRelative.split('/');
    const fileSegments = normalizedFilePath.split('/');
    const folderSegments = fileSegments.slice(0, -1);

    return containsSegmentSequence(folderSegments, relativeSegments);
  }

  const normalizedAttachmentPath = normalizePath(attachmentFolderPath);

  return normalizedFilePath.startsWith(normalizedAttachmentPath + '/') ||
         normalizedFilePath === normalizedAttachmentPath;
}
