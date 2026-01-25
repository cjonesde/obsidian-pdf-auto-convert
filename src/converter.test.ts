import { generateFrontmatter, generateMarkdownOutput } from './converter';
import { DocumentMetadata } from './types';

describe('generateFrontmatter', () => {
  it('should generate frontmatter with all fields', () => {
    const metadata: DocumentMetadata = {
      title: 'My Document',
      author: 'John Doe',
      created: '2025-12-15',
      modified: '2026-01-10',
      tags: ['report', 'quarterly'],
    };

    const result = generateFrontmatter(metadata, 'attachments/doc.pdf', false);

    expect(result).toContain('---');
    expect(result).toContain('source: "[[attachments/doc.pdf]]"');
    expect(result).toContain('author: "John Doe"');
    expect(result).toContain('created: 2025-12-15');
    expect(result).toContain('modified: 2026-01-10');
    expect(result).toContain('tags:');
    expect(result).toContain('  - report');
    expect(result).toContain('  - quarterly');
  });

  it('should generate frontmatter with markdown links', () => {
    const metadata: DocumentMetadata = {
      author: 'Jane Doe',
    };

    const result = generateFrontmatter(metadata, 'attachments/doc.pdf', true);

    expect(result).toContain('source: "[doc.pdf](attachments/doc.pdf)"');
  });

  it('should omit missing fields', () => {
    const metadata: DocumentMetadata = {
      author: 'John Doe',
    };

    const result = generateFrontmatter(metadata, 'attachments/doc.pdf', false);

    expect(result).not.toContain('title:');
    expect(result).not.toContain('created:');
    expect(result).not.toContain('modified:');
    expect(result).not.toContain('tags:');
    expect(result).toContain('author: "John Doe"');
  });

  it('should escape quotes in strings', () => {
    const metadata: DocumentMetadata = {
      author: 'John "Johnny" Doe',
    };

    const result = generateFrontmatter(metadata, 'attachments/doc.pdf', false);

    expect(result).toContain('author: "John \\"Johnny\\" Doe"');
  });

  it('should handle empty metadata', () => {
    const metadata: DocumentMetadata = {};

    const result = generateFrontmatter(metadata, 'attachments/doc.pdf', false);

    expect(result).toContain('---');
    expect(result).toContain('source:');
  });

  it('should omit source when PDF path is missing', () => {
    const metadata: DocumentMetadata = {
      author: 'John Doe',
    };

    const result = generateFrontmatter(metadata, '', false);

    expect(result).toContain('author: "John Doe"');
    expect(result).not.toContain('source:');
  });
});

describe('generateMarkdownOutput', () => {
  it('should combine frontmatter and content', () => {
    const metadata: DocumentMetadata = {
      title: 'Test Document',
      author: 'Author',
    };

    const result = generateMarkdownOutput(
      '# Heading\n\nContent here.',
      metadata,
      'attachments/test.pdf',
      false,
      true
    );

    expect(result).toContain('---');
    expect(result).toContain('source:');
    expect(result).toContain('# Heading');
    expect(result).toContain('Content here.');
  });

  it('should skip frontmatter when includeFrontmatter is false', () => {
    const metadata: DocumentMetadata = {
      title: 'Test Document',
    };

    const result = generateMarkdownOutput(
      '# Heading',
      metadata,
      'attachments/test.pdf',
      false,
      false
    );

    expect(result).not.toContain('---');
    expect(result).toContain('# Heading');
  });

  it('should handle empty content with frontmatter', () => {
    const metadata: DocumentMetadata = {
      author: 'Author',
    };

    const result = generateMarkdownOutput(
      '',
      metadata,
      '',
      false,
      true
    );

    expect(result).toContain('---');
    expect(result).toContain('author: "Author"');
    expect(result).not.toContain('source:');
  });
});
