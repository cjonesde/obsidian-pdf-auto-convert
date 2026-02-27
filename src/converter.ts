import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DocumentMetadata, ConversionResult, ConverterType } from './types';
import { extractMetadata } from './metadata';
import { collectExtractedImages } from './image-handler';
import { generatePdfLink } from './path-resolver';

const execFileAsync = promisify(execFile);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const mkdtempAsync = promisify(fs.mkdtemp);
const rmdirAsync = promisify(fs.rm);

/**
 * Options for the convertPdf entry point.
 */
export interface ConvertPdfOptions {
  documentName: string;
  markerPath?: string;
  pdftotextPath?: string;
  converter?: ConverterType;
  timeoutSeconds?: number;
}

/**
 * Safeguard options passed to execFileAsync calls.
 */
interface ExecSafeguards {
  timeout: number;
  maxBuffer: number;
}

const MAX_BUFFER = 50 * 1024 * 1024; // 50 MB

/**
 * Detect whether an error was caused by resource limits (killed process,
 * timeout, or maxBuffer exceeded). These should NOT be retried.
 */
export function isResourceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  if (err.killed === true) return true;
  if (err.signal === 'SIGTERM' || err.signal === 'SIGKILL') return true;
  if (typeof err.code === 'string' && err.code === 'ETIMEDOUT') return true;
  const msg = typeof err.message === 'string' ? err.message : '';
  if (msg.includes('maxBuffer')) return true;
  if (msg.includes('ETIMEDOUT')) return true;
  return false;
}

/**
 * Escape quotes in a YAML string value.
 */
function escapeYamlString(value: string): string {
  return value.replace(/"/g, '\\"');
}

/**
 * Generate YAML frontmatter from document metadata.
 */
export function generateFrontmatter(
  metadata: DocumentMetadata,
  pdfPath: string | undefined,
  useMarkdownLinks: boolean
): string {
  const lines: string[] = ['---'];

  if (pdfPath) {
    const sourceLink = generatePdfLink(pdfPath, useMarkdownLinks);
    lines.push(`source: "${escapeYamlString(sourceLink)}"`);
  }

  if (metadata.author) {
    lines.push(`author: "${escapeYamlString(metadata.author)}"`);
  }

  if (metadata.created) {
    lines.push(`created: ${metadata.created}`);
  }

  if (metadata.modified) {
    lines.push(`modified: ${metadata.modified}`);
  }

  if (metadata.tags && metadata.tags.length > 0) {
    lines.push('tags:');
    for (const tag of metadata.tags) {
      lines.push(`  - ${tag}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

/**
 * Generate the final Markdown output.
 */
export function generateMarkdownOutput(
  content: string,
  metadata: DocumentMetadata,
  pdfPath: string | undefined,
  useMarkdownLinks: boolean,
  includeFrontmatter: boolean
): string {
  if (!includeFrontmatter) {
    return content;
  }

  const frontmatter = generateFrontmatter(metadata, pdfPath, useMarkdownLinks);
  return content ? `${frontmatter}\n\n${content}` : frontmatter;
}

/**
 * Convert PDF to Markdown using Marker.
 * Passes timeout and maxBuffer safeguards to both attempts.
 * Does NOT retry on resource errors (timeout, killed, maxBuffer).
 */
async function convertWithMarker(
  inputDir: string,
  markerPath: string,
  outputDir: string,
  safeguards: ExecSafeguards
): Promise<string> {
  const markerCmd = markerPath || 'marker';
  try {
    const { stdout } = await execFileAsync(markerCmd, [
      '--output_dir', outputDir,
      '--output_format', 'markdown',
      inputDir,
    ], safeguards);
    return stdout;
  } catch (error) {
    if (isResourceError(error)) throw error;
    const { stdout } = await execFileAsync(markerCmd, [
      '--output_dir', outputDir,
      inputDir,
    ], safeguards);
    return stdout;
  }
}

/**
 * Convert PDF to text using poppler's pdftotext.
 * Lightweight alternative that preserves layout but produces plain text, not rich Markdown.
 */
async function convertWithPdftotext(
  pdfPath: string,
  pdftotextPath: string,
  safeguards: ExecSafeguards
): Promise<string> {
  const cmd = pdftotextPath || 'pdftotext';
  const { stdout } = await execFileAsync(cmd, ['-layout', pdfPath, '-'], safeguards);
  return stdout;
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

async function readMarkerMarkdown(
  outputDir: string,
  documentName: string
): Promise<{ content: string; filePath: string }> {
  const files = await listFiles(outputDir);
  const markdownFiles = files.filter((filePath) => {
    const extension = path.extname(filePath).toLowerCase();
    return extension === '.md' || extension === '.markdown';
  });

  if (markdownFiles.length === 0) {
    throw new Error('Marker did not produce a Markdown file.');
  }

  markdownFiles.sort((a, b) => a.localeCompare(b));

  const normalizedName = documentName.trim().toLowerCase();
  const matching = markdownFiles.find((filePath) =>
    path.basename(filePath, path.extname(filePath)).toLowerCase() === normalizedName
  );

  const selectedFile = matching ?? markdownFiles[0];
  const content = await fs.promises.readFile(selectedFile, 'utf8');
  return { content, filePath: selectedFile };
}

/**
 * Post-process Markdown output to fix image references.
 */
export function replaceImageReferences(
  markdown: string,
  imagePaths: Map<string, string>,
  useMarkdownLinks: boolean
): string {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match: string, alt: string, target: string): string => {
    const rawTarget = target.trim();
    const rawPath = rawTarget.split(/\s+/)[0];
    const normalizedPath = rawPath.replace(/^\.\/+/, '');
    const imagePath = imagePaths.get(normalizedPath) || imagePaths.get(rawPath);

    if (imagePath) {
      if (useMarkdownLinks) {
        const encodedPath = imagePath.split('/').map(encodeURIComponent).join('/');
        return alt ? `![${alt}](${encodedPath})` : `![](${encodedPath})`;
      }
      return `![[${imagePath}]]`;
    }

    return match;
  });
}

/**
 * Run the full marker conversion pipeline (write temp file, invoke marker, read output).
 */
async function runMarkerConversion(
  buffer: ArrayBuffer,
  documentName: string,
  markerPath: string,
  safeguards: ExecSafeguards
): Promise<ConversionResult> {
  const warnings: string[] = [];

  const tempDir = await mkdtempAsync(path.join(os.tmpdir(), 'pdf-convert-'));
  const inputDir = path.join(tempDir, 'input');
  const tempFile = path.join(inputDir, 'input.pdf');
  const outputDir = path.join(tempDir, 'marker-output');

  try {
    await fs.promises.mkdir(inputDir, { recursive: true });
    await writeFileAsync(tempFile, Buffer.from(buffer));
    await fs.promises.mkdir(outputDir, { recursive: true });

    const metadata = await extractMetadata(tempFile);
    const markerStdout = await convertWithMarker(inputDir, markerPath, outputDir, safeguards);
    let markdown = '';
    let markdownPath = '';
    try {
      const markerOutput = await readMarkerMarkdown(outputDir, documentName);
      markdown = markerOutput.content;
      markdownPath = markerOutput.filePath;
    } catch {
      markdown = markerStdout;
    }
    if (!markdown || markdown.trim().length === 0) {
      throw new Error('Marker did not produce any Markdown output.');
    }
    const referenceRoot = markdownPath ? path.dirname(markdownPath) : outputDir;
    const images = await collectExtractedImages(outputDir, documentName, referenceRoot);

    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    return {
      markdown: markdown.trim(),
      metadata,
      images,
      warnings,
    };
  } finally {
    try {
      await unlinkAsync(tempFile);
      await rmdirAsync(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Run pdftotext conversion pipeline.
 */
async function runPdftotextConversion(
  buffer: ArrayBuffer,
  documentName: string,
  pdftotextPath: string,
  safeguards: ExecSafeguards
): Promise<ConversionResult> {
  const tempDir = await mkdtempAsync(path.join(os.tmpdir(), 'pdf-convert-'));
  const tempFile = path.join(tempDir, 'input.pdf');

  try {
    await writeFileAsync(tempFile, Buffer.from(buffer));
    const metadata = await extractMetadata(tempFile);
    const text = await convertWithPdftotext(tempFile, pdftotextPath, safeguards);

    if (!text || text.trim().length === 0) {
      throw new Error('pdftotext did not produce any output.');
    }

    return {
      markdown: text.trim(),
      metadata,
      images: [],
      warnings: ['Converted with pdftotext (plain text only, no images).'],
    };
  } finally {
    try {
      await unlinkAsync(tempFile);
      await rmdirAsync(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Convert a PDF buffer to Markdown.
 * Dispatches to the appropriate backend based on options.converter:
 * - 'marker': ML-based conversion (default)
 * - 'pdftotext': lightweight poppler text extraction
 * - 'auto': try marker, fall back to pdftotext on resource errors
 */
export async function convertPdf(
  buffer: ArrayBuffer,
  options: ConvertPdfOptions
): Promise<ConversionResult> {
  const {
    documentName,
    markerPath = '',
    pdftotextPath = '',
    converter = 'marker',
    timeoutSeconds = 120,
  } = options;

  const safeguards: ExecSafeguards = {
    timeout: timeoutSeconds * 1000,
    maxBuffer: MAX_BUFFER,
  };

  try {
    if (converter === 'pdftotext') {
      return await runPdftotextConversion(buffer, documentName, pdftotextPath, safeguards);
    }

    if (converter === 'marker') {
      return await runMarkerConversion(buffer, documentName, markerPath, safeguards);
    }

    // 'auto': try marker, fall back to pdftotext on resource errors
    try {
      return await runMarkerConversion(buffer, documentName, markerPath, safeguards);
    } catch (markerError) {
      if (!isResourceError(markerError)) throw markerError;
      const timeoutMsg = `Marker was terminated after ${timeoutSeconds}s. Falling back to pdftotext.`;
      console.warn('PDF Auto Converter:', timeoutMsg);
      const result = await runPdftotextConversion(buffer, documentName, pdftotextPath, safeguards);
      result.warnings.unshift(timeoutMsg);
      return result;
    }
  } catch (error) {
    if (isResourceError(error)) {
      throw new Error(
        `Conversion was terminated after ${timeoutSeconds}s. ` +
        'The PDF may be too large or complex for this machine. ' +
        'Try pdftotext backend or increase the timeout in settings.'
      );
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('ENOENT') && errorMessage.includes('marker')) {
      throw new Error('Marker is not installed. Please install marker-pdf to use this plugin.');
    }
    if (errorMessage.includes('ENOENT') && errorMessage.includes('pdftotext')) {
      throw new Error('pdftotext is not installed. Please install poppler-utils.');
    }

    throw error;
  }
}

/**
 * Check if a PDF file is password protected or corrupted.
 */
export async function isPasswordProtected(
  buffer: ArrayBuffer,
  pdfInfoPath: string = ''
): Promise<boolean> {
  const tempDir = await mkdtempAsync(path.join(os.tmpdir(), 'pdf-check-'));
  const tempFile = path.join(tempDir, 'check.pdf');
  const pdfInfoCmd = pdfInfoPath || 'pdfinfo';

  try {
    await writeFileAsync(tempFile, Buffer.from(buffer));
    const { stdout } = await execFileAsync(pdfInfoCmd, [tempFile]);
    return /encrypted:\s*yes/i.test(stdout);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const message = errorMessage.toLowerCase();
    return message.includes('encrypt') ||
      message.includes('password') ||
      message.includes('protected');
  } finally {
    try {
      await unlinkAsync(tempFile);
      await rmdirAsync(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

function getMarkerCandidates(markerPath: string): string[] {
  const trimmed = markerPath.trim();
  if (trimmed.length > 0) {
    return [trimmed];
  }

  const candidates = ['marker', 'marker-pdf'];

  if (process.platform === 'darwin') {
    candidates.push(
      '/opt/homebrew/bin/marker',
      '/usr/local/bin/marker',
      '/opt/local/bin/marker',
      '/usr/bin/marker'
    );
  } else if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\marker\\marker.exe',
      'C:\\Program Files (x86)\\marker\\marker.exe'
    );
  } else {
    candidates.push(
      '/usr/local/bin/marker',
      '/usr/bin/marker',
      '/snap/bin/marker'
    );
  }

  return Array.from(new Set(candidates));
}

/**
 * Check if a file exists (for absolute paths).
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find executable using 'which' command (fast PATH lookup).
 */
async function whichCommand(command: string): Promise<string | null> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execFileAsync(whichCmd, [command]);
    const result = stdout.trim().split('\n')[0];
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Check if Marker is installed and get version info.
 * Optimized to avoid slow Python startup when possible.
 */
export async function isMarkerInstalled(
  markerPath: string = ''
): Promise<{ installed: boolean; version?: string; path?: string }> {
  const candidates = getMarkerCandidates(markerPath);

  for (const candidate of candidates) {
    // For absolute paths, check if file exists first (instant)
    if (path.isAbsolute(candidate)) {
      if (await fileExists(candidate)) {
        return { installed: true, version: 'unknown', path: candidate };
      }
      continue;
    }

    // For command names, use 'which' to find the path (fast)
    const resolvedPath = await whichCommand(candidate);
    if (resolvedPath) {
      return { installed: true, version: 'unknown', path: resolvedPath };
    }
  }

  return { installed: false };
}

/**
 * Check if pdftotext (from poppler) is installed.
 * Follows the same pattern as isMarkerInstalled.
 */
export async function isPdftotextInstalled(
  pdftotextPath: string = ''
): Promise<{ installed: boolean; path?: string }> {
  const trimmed = pdftotextPath.trim();
  if (trimmed.length > 0) {
    if (path.isAbsolute(trimmed)) {
      if (await fileExists(trimmed)) {
        return { installed: true, path: trimmed };
      }
      return { installed: false };
    }
    const resolved = await whichCommand(trimmed);
    return resolved ? { installed: true, path: resolved } : { installed: false };
  }

  const resolved = await whichCommand('pdftotext');
  return resolved ? { installed: true, path: resolved } : { installed: false };
}
