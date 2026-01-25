import { execFile } from 'child_process';
import { promisify } from 'util';
import { DocumentMetadata } from './types';

const execFileAsync = promisify(execFile);

/**
 * Parse a PDF date string into YYYY-MM-DD format.
 */
export function parsePdfDate(dateStr: string | undefined): string | undefined {
  if (!dateStr) {
    return undefined;
  }

  const trimmed = dateStr.trim();
  const pdfDateMatch = trimmed.match(/D:(\d{4})(\d{2})(\d{2})/);
  if (pdfDateMatch) {
    return `${pdfDateMatch[1]}-${pdfDateMatch[2]}-${pdfDateMatch[3]}`;
  }

  const isoMatch = trimmed.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const compactMatch = trimmed.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  try {
    const date = new Date(trimmed);
    if (isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString().split('T')[0];
  } catch {
    return undefined;
  }
}

/**
 * Parse pdfinfo output and extract metadata.
 */
export function parsePdfInfoOutput(output: string): DocumentMetadata {
  if (!output || output.length === 0) {
    return {};
  }

  const metadata: DocumentMetadata = {};
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (!value || value.toLowerCase() === 'unknown') {
      continue;
    }

    if (key === 'title') {
      metadata.title = value;
    } else if (key === 'author') {
      metadata.author = value;
    } else if (key === 'keywords') {
      const separator = value.includes(';') ? ';' : ',';
      metadata.tags = value
        .split(separator)
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    } else if (key === 'creationdate') {
      const parsed = parsePdfDate(value);
      if (parsed) {
        metadata.created = parsed;
      }
    } else if (key === 'moddate') {
      const parsed = parsePdfDate(value);
      if (parsed) {
        metadata.modified = parsed;
      }
    }
  }

  return metadata;
}

/**
 * Extract metadata from a PDF file using pdfinfo (if available).
 */
export async function extractMetadata(
  pdfPath: string,
  pdfInfoPath: string = ''
): Promise<DocumentMetadata> {
  if (!pdfPath) {
    return {};
  }

  const pdfInfoCmd = pdfInfoPath || 'pdfinfo';
  try {
    const { stdout } = await execFileAsync(pdfInfoCmd, [pdfPath]);
    return parsePdfInfoOutput(stdout);
  } catch {
    return {};
  }
}
