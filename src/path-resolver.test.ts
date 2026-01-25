import {
  resolveAttachmentPath,
  generateImageLink,
  generatePdfLink,
  getParentFolder,
  sanitizeFilename,
  isInAttachmentFolder,
} from './path-resolver';

describe('sanitizeFilename', () => {
  it('should remove invalid characters', () => {
    expect(sanitizeFilename('file:name?.pdf')).toBe('filename.pdf');
    expect(sanitizeFilename('path/to\\file')).toBe('pathtofile');
    expect(sanitizeFilename('file<>name')).toBe('filename');
  });

  it('should trim whitespace', () => {
    expect(sanitizeFilename('  filename.pdf  ')).toBe('filename.pdf');
  });

  it('should handle empty strings', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});

describe('getParentFolder', () => {
  it('should return parent folder for nested path', () => {
    expect(getParentFolder('folder/subfolder/file.md')).toBe('folder/subfolder');
  });

  it('should return empty string for root-level file', () => {
    expect(getParentFolder('file.md')).toBe('');
  });

  it('should handle deeply nested paths', () => {
    expect(getParentFolder('a/b/c/d/file.md')).toBe('a/b/c/d');
  });
});

describe('resolveAttachmentPath', () => {
  it('should resolve to specific attachment folder', () => {
    const result = resolveAttachmentPath('attachments', 'notes/daily/file.pdf', 'image.png');
    expect(result).toBe('attachments/image.png');
  });

  it('should resolve to same folder (./) as source', () => {
    const result = resolveAttachmentPath('./', 'notes/daily/file.pdf', 'image.png');
    expect(result).toBe('notes/daily/image.png');
  });

  it('should resolve to subfolder under current file (./assets)', () => {
    const result = resolveAttachmentPath('./assets', 'notes/daily/file.pdf', 'image.png');
    expect(result).toBe('notes/daily/assets/image.png');
  });

  it('should handle root-level source file with specific folder', () => {
    const result = resolveAttachmentPath('attachments', 'file.pdf', 'image.png');
    expect(result).toBe('attachments/image.png');
  });

  it('should handle root-level source file with same folder (./) setting', () => {
    const result = resolveAttachmentPath('./', 'file.pdf', 'image.png');
    expect(result).toBe('image.png');
  });

  it('should handle empty attachment folder (root)', () => {
    const result = resolveAttachmentPath('', 'notes/file.pdf', 'image.png');
    expect(result).toBe('image.png');
  });

  it('should handle / attachment folder (root)', () => {
    const result = resolveAttachmentPath('/', 'notes/file.pdf', 'image.png');
    expect(result).toBe('image.png');
  });
});

describe('generateImageLink', () => {
  describe('wiki links (useMarkdownLinks: false)', () => {
    it('should generate wiki-style image embed', () => {
      const result = generateImageLink('attachments/image.png', false);
      expect(result).toBe('![[attachments/image.png]]');
    });

    it('should handle root-level images', () => {
      const result = generateImageLink('image.png', false);
      expect(result).toBe('![[image.png]]');
    });
  });

  describe('markdown links (useMarkdownLinks: true)', () => {
    it('should generate markdown-style image embed', () => {
      const result = generateImageLink('attachments/image.png', true);
      expect(result).toBe('![](attachments/image.png)');
    });

    it('should encode spaces in path', () => {
      const result = generateImageLink('attachments/my image.png', true);
      expect(result).toBe('![](attachments/my%20image.png)');
    });
  });
});

describe('generatePdfLink', () => {
  describe('wiki links (useMarkdownLinks: false)', () => {
    it('should generate wiki-style link', () => {
      const result = generatePdfLink('attachments/document.pdf', false);
      expect(result).toBe('[[attachments/document.pdf]]');
    });
  });

  describe('markdown links (useMarkdownLinks: true)', () => {
    it('should generate markdown-style link', () => {
      const result = generatePdfLink('attachments/document.pdf', true);
      expect(result).toBe('[document.pdf](attachments/document.pdf)');
    });

    it('should encode spaces in path', () => {
      const result = generatePdfLink('attachments/my document.pdf', true);
      expect(result).toBe('[my document.pdf](attachments/my%20document.pdf)');
    });
  });
});

describe('isInAttachmentFolder', () => {
  it('should return false for root or same-folder settings', () => {
    expect(isInAttachmentFolder('notes/file.pdf', '')).toBe(false);
    expect(isInAttachmentFolder('notes/file.pdf', '/')).toBe(false);
    expect(isInAttachmentFolder('notes/file.pdf', '.')).toBe(false);
    expect(isInAttachmentFolder('notes/file.pdf', './')).toBe(false);
  });

  it('should detect absolute attachment folders', () => {
    expect(isInAttachmentFolder('attachments/doc.pdf', 'attachments')).toBe(true);
    expect(isInAttachmentFolder('attachments/sub/doc.pdf', 'attachments')).toBe(true);
    expect(isInAttachmentFolder('notes/attachments/doc.pdf', 'attachments')).toBe(false);
  });

  it('should detect relative attachment subfolders', () => {
    expect(isInAttachmentFolder('notes/assets/doc.pdf', './assets')).toBe(true);
    expect(isInAttachmentFolder('notes/assets/archive/doc.pdf', './assets')).toBe(true);
    expect(isInAttachmentFolder('notes/other/doc.pdf', './assets')).toBe(false);
  });

  it('should detect nested relative attachment folders', () => {
    expect(isInAttachmentFolder('notes/assets/images/doc.pdf', './assets/images')).toBe(true);
    expect(isInAttachmentFolder('notes/assets/doc.pdf', './assets/images')).toBe(false);
  });
});
