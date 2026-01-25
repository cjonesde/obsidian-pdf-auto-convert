import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DocumentMetadata, ConversionResult } from './types';
import { extractMetadata } from './metadata';
import { collectExtractedImages } from './image-handler';
import { generatePdfLink } from './path-resolver';

const execFileAsync = promisify(execFile);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const mkdtempAsync = promisify(fs.mkdtemp);
const rmdirAsync = promisify(fs.rm);

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
 * Convert PDF to markdown using Pandoc.
 */
async function convertWithPandoc(
  pdfPath: string,
  pandocPath: string,
  extractMediaDir: string
): Promise<string> {
  const pandocCmd = pandocPath || 'pandoc';
  const { stdout } = await execFileAsync(pandocCmd, [
    '-f', 'pdf',
    '-t', 'markdown',
    '--wrap=none',
    '--markdown-headings=atx',
    `--extract-media=${extractMediaDir}`,
    pdfPath,
  ]);
  return stdout;
}

/**
 * Post-process Pandoc markdown output to fix image references.
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
 * Convert a PDF file to Markdown using Pandoc.
 */
export async function convertPdf(
  buffer: ArrayBuffer,
  documentName: string,
  pandocPath: string = ''
): Promise<ConversionResult> {
  const warnings: string[] = [];

  const tempDir = await mkdtempAsync(path.join(os.tmpdir(), 'pdf-convert-'));
  const tempFile = path.join(tempDir, 'input.pdf');
  const extractMediaDir = path.join(tempDir, 'extract-media');

  try {
    await writeFileAsync(tempFile, Buffer.from(buffer));
    await fs.promises.mkdir(extractMediaDir, { recursive: true });

    const metadata = await extractMetadata(tempFile);
    let markdown = await convertWithPandoc(tempFile, pandocPath, extractMediaDir);
    const images = await collectExtractedImages(extractMediaDir, documentName);

    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    return {
      markdown: markdown.trim(),
      metadata,
      images,
      warnings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('ENOENT') && errorMessage.includes('pandoc')) {
      throw new Error('Pandoc is not installed. Please install Pandoc to use this plugin.');
    }

    throw error;
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
 * Check if a PDF file is password protected or corrupted.
 */
export async function isPasswordProtected(
  buffer: ArrayBuffer,
  pandocPath: string = ''
): Promise<boolean> {
  const tempDir = await mkdtempAsync(path.join(os.tmpdir(), 'pdf-check-'));
  const tempFile = path.join(tempDir, 'check.pdf');
  const pandocCmd = pandocPath || 'pandoc';

  try {
    await writeFileAsync(tempFile, Buffer.from(buffer));
    await execFileAsync(pandocCmd, ['-f', 'pdf', '-t', 'plain', tempFile]);
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const message = errorMessage.toLowerCase();
    return message.includes('encrypt') ||
      message.includes('password') ||
      message.includes('protected') ||
      message.includes('could not parse');
  } finally {
    try {
      await unlinkAsync(tempFile);
      await rmdirAsync(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

function getPandocCandidates(pandocPath: string): string[] {
  const trimmed = pandocPath.trim();
  if (trimmed.length > 0) {
    return [trimmed];
  }

  const candidates = ['pandoc'];

  if (process.platform === 'darwin') {
    candidates.push(
      '/opt/homebrew/bin/pandoc',
      '/usr/local/bin/pandoc',
      '/opt/local/bin/pandoc',
      '/usr/bin/pandoc'
    );
  } else if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Pandoc\\pandoc.exe',
      'C:\\Program Files (x86)\\Pandoc\\pandoc.exe'
    );
  } else {
    candidates.push(
      '/usr/local/bin/pandoc',
      '/usr/bin/pandoc',
      '/snap/bin/pandoc'
    );
  }

  return Array.from(new Set(candidates));
}

/**
 * Check if Pandoc is installed and get version info.
 */
export async function isPandocInstalled(
  pandocPath: string = ''
): Promise<{ installed: boolean; version?: string; path?: string }> {
  const candidates = getPandocCandidates(pandocPath);

  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(candidate, ['--version']);
      const versionMatch = stdout.match(/pandoc[^\d]*(\d+\.\d+(?:\.\d+)?)/i);
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : 'unknown',
        path: candidate,
      };
    } catch {
      continue;
    }
  }

  return { installed: false };
}
