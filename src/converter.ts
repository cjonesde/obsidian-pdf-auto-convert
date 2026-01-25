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
 * Convert PDF to Markdown using Marker.
 */
async function convertWithMarker(
  pdfPath: string,
  markerPath: string,
  outputDir: string
): Promise<string> {
  const markerCmd = markerPath || 'marker';
  try {
    const { stdout } = await execFileAsync(markerCmd, [
      '--output_dir', outputDir,
      '--output_format', 'markdown',
      pdfPath,
    ]);
    return stdout;
  } catch {
    const { stdout } = await execFileAsync(markerCmd, [
      '--output_dir', outputDir,
      pdfPath,
    ]);
    return stdout;
  }
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
 * Convert a PDF file to Markdown using Marker.
 */
export async function convertPdf(
  buffer: ArrayBuffer,
  documentName: string,
  markerPath: string = ''
): Promise<ConversionResult> {
  const warnings: string[] = [];

  const tempDir = await mkdtempAsync(path.join(os.tmpdir(), 'pdf-convert-'));
  const tempFile = path.join(tempDir, 'input.pdf');
  const outputDir = path.join(tempDir, 'marker-output');

  try {
    await writeFileAsync(tempFile, Buffer.from(buffer));
    await fs.promises.mkdir(outputDir, { recursive: true });

    const metadata = await extractMetadata(tempFile);
    const markerStdout = await convertWithMarker(tempFile, markerPath, outputDir);
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('ENOENT') && errorMessage.includes('marker')) {
      throw new Error('Marker is not installed. Please install marker-pdf to use this plugin.');
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
 * Check if Marker is installed and get version info.
 */
export async function isMarkerInstalled(
  markerPath: string = ''
): Promise<{ installed: boolean; version?: string; path?: string }> {
  const candidates = getMarkerCandidates(markerPath);

  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(candidate, ['--version']);
      const versionMatch = stdout.match(/(\d+\.\d+(?:\.\d+)?)/);
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : 'unknown',
        path: candidate,
      };
    } catch {
      try {
        await execFileAsync(candidate, ['--help']);
        return { installed: true, version: 'unknown', path: candidate };
      } catch {
        continue;
      }
    }
  }

  return { installed: false };
}
