import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  collectExtractedImages,
  generateImageFilename,
  getContentTypeFromExtension,
} from './image-handler';

describe('getContentTypeFromExtension', () => {
  it('should return correct content type for common image types', () => {
    expect(getContentTypeFromExtension('png')).toBe('image/png');
    expect(getContentTypeFromExtension('jpg')).toBe('image/jpeg');
    expect(getContentTypeFromExtension('gif')).toBe('image/gif');
    expect(getContentTypeFromExtension('webp')).toBe('image/webp');
    expect(getContentTypeFromExtension('svg')).toBe('image/svg+xml');
  });

  it('should return png as default for unknown types', () => {
    expect(getContentTypeFromExtension('unknown')).toBe('image/png');
    expect(getContentTypeFromExtension('')).toBe('image/png');
  });
});

describe('generateImageFilename', () => {
  it('should generate filename with document name and index', () => {
    expect(generateImageFilename('My Document', 1, 'png')).toBe('My Document-1.png');
    expect(generateImageFilename('Report', 5, 'jpg')).toBe('Report-5.jpg');
  });

  it('should sanitize document name', () => {
    expect(generateImageFilename('My:Document?', 1, 'png')).toBe('MyDocument-1.png');
  });
});

describe('collectExtractedImages', () => {
  it('should collect extracted images from a media folder', async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdf-media-'));
    const mediaDir = path.join(tempDir, 'media');
    await fs.promises.mkdir(mediaDir);

    await fs.promises.writeFile(path.join(mediaDir, 'image1.png'), Buffer.from([0x89, 0x50]));
    await fs.promises.writeFile(path.join(mediaDir, 'image2.jpg'), Buffer.from([0xff, 0xd8]));
    await fs.promises.writeFile(path.join(mediaDir, 'note.txt'), Buffer.from('ignore'));

    const images = await collectExtractedImages(tempDir, 'Doc');

    expect(images.length).toBe(2);
    expect(images[0].filename).toBe('Doc-1.png');
    expect(images[0].sourcePath).toBe('media/image1.png');
    expect(images[1].filename).toBe('Doc-2.jpg');
    expect(images[1].sourcePath).toBe('media/image2.jpg');

    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });
});
