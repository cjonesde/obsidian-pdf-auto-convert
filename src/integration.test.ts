/**
 * Integration test: run convertPdf against real PDFs in 1-Todo/.
 * Tests all three converter modes + timeout safeguard.
 *
 * Run with: npx jest src/integration.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { convertPdf, isResourceError, isPdftotextInstalled, isMarkerInstalled } from './converter';
import { ConverterType } from './types';

const TODO_DIR = '/Users/christopherjones/vault/SECJUR/1-Todo';

const PDF_FILES = [
  path.join(TODO_DIR, '20231126_SECJUR_DCO arch. & frontend.pdf'),
  path.join(TODO_DIR, '241217_SECJUR AI Intelligence.pdf'),
  path.join(TODO_DIR, 'attachments', 'Digital Compliance Plattform_SECJUR (1) (1).pdf'),
  path.join(TODO_DIR, 'attachments', 'SECJUR Tech DD for GZC Ventures.pdf'),
];

// Skip entire suite if PDFs are not present (CI environments)
const pdfsMissing = PDF_FILES.some((f) => !fs.existsSync(f));

const describeIf = pdfsMissing ? describe.skip : describe;

describeIf('integration: convertPdf on 1-Todo PDFs', () => {
  // Extend timeout: marker is slow (ML model load)
  jest.setTimeout(180_000);

  let markerInstalled = false;
  let pdftotextInstalled = false;

  beforeAll(async () => {
    const m = await isMarkerInstalled();
    markerInstalled = m.installed;
    const p = await isPdftotextInstalled();
    pdftotextInstalled = p.installed;
    console.log(`Marker: ${markerInstalled ? 'found' : 'NOT FOUND'}`);
    console.log(`pdftotext: ${pdftotextInstalled ? 'found' : 'NOT FOUND'}`);
  });

  describe('pdftotext backend', () => {
    // Separate text-based PDFs from scan/design-only PDFs
    const TEXT_PDFS = PDF_FILES.filter(
      (f) => !path.basename(f).startsWith('Digital Compliance')
    );
    const SCAN_PDFS = PDF_FILES.filter(
      (f) => path.basename(f).startsWith('Digital Compliance')
    );

    it.each(TEXT_PDFS.map((f) => [path.basename(f), f]))(
      'converts text-based %s',
      async (_name, filePath) => {
        if (!pdftotextInstalled) {
          console.warn('pdftotext not installed, skipping');
          return;
        }
        const buffer = fs.readFileSync(filePath).buffer;
        const docName = path.basename(filePath, '.pdf');
        const result = await convertPdf(buffer, {
          documentName: docName,
          converter: 'pdftotext',
          timeoutSeconds: 120,
        });
        expect(result.markdown.length).toBeGreaterThan(0);
        expect(result.warnings).toContain('Converted with pdftotext (plain text only, no images).');
        console.log(`  ${_name}: ${result.markdown.length} chars`);
      }
    );

    it.each(SCAN_PDFS.map((f) => [path.basename(f), f]))(
      'correctly fails on scan-only %s (no text layer)',
      async (_name, filePath) => {
        if (!pdftotextInstalled) {
          console.warn('pdftotext not installed, skipping');
          return;
        }
        const buffer = fs.readFileSync(filePath).buffer;
        const docName = path.basename(filePath, '.pdf');
        await expect(
          convertPdf(buffer, {
            documentName: docName,
            converter: 'pdftotext',
            timeoutSeconds: 120,
          })
        ).rejects.toThrow('pdftotext did not produce any output');
        console.log(`  ${_name}: correctly rejected (scan-only PDF)`);
      }
    );
  });

  describe('marker backend (smallest file only)', () => {
    it('converts 20231126_SECJUR_DCO arch. & frontend.pdf', async () => {
      if (!markerInstalled) {
        console.warn('Marker not installed, skipping');
        return;
      }
      const filePath = PDF_FILES[0]; // 606K - smallest
      const buffer = fs.readFileSync(filePath).buffer;
      const result = await convertPdf(buffer, {
        documentName: path.basename(filePath, '.pdf'),
        converter: 'marker',
        timeoutSeconds: 120,
      });
      expect(result.markdown.length).toBeGreaterThan(0);
      console.log(`  marker: ${result.markdown.length} chars, ${result.images.length} images`);
    });
  });

  describe('timeout safeguard', () => {
    it('terminates marker on 1s timeout with resource error message', async () => {
      if (!markerInstalled) {
        console.warn('Marker not installed, skipping');
        return;
      }
      const filePath = PDF_FILES[2]; // 6.3MB - largest
      const buffer = fs.readFileSync(filePath).buffer;
      await expect(
        convertPdf(buffer, {
          documentName: path.basename(filePath, '.pdf'),
          converter: 'marker',
          timeoutSeconds: 1,
        })
      ).rejects.toThrow('terminated after');
    });
  });

  describe('auto mode fallback', () => {
    it('falls back to pdftotext when marker times out (1s)', async () => {
      if (!markerInstalled || !pdftotextInstalled) {
        console.warn('Need both marker and pdftotext installed, skipping');
        return;
      }
      // Use a text-based PDF so pdftotext fallback can actually produce output
      const filePath = PDF_FILES[3]; // SECJUR Tech DD (2.1MB, has text layer)
      const buffer = fs.readFileSync(filePath).buffer;
      const result = await convertPdf(buffer, {
        documentName: path.basename(filePath, '.pdf'),
        converter: 'auto',
        timeoutSeconds: 1,
      });
      expect(result.markdown.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('Falling back'))).toBe(true);
      console.log(`  auto fallback: ${result.markdown.length} chars`);
      console.log(`  warnings: ${result.warnings.join('; ')}`);
    });
  });
});
