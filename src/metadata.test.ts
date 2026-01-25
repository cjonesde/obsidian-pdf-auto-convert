import { parsePdfDate, parsePdfInfoOutput } from './metadata';

describe('parsePdfDate', () => {
  it('should parse PDF date format', () => {
    expect(parsePdfDate('D:20251215')).toBe('2025-12-15');
    expect(parsePdfDate('D:20251215103000Z')).toBe('2025-12-15');
  });

  it('should parse ISO and compact dates', () => {
    expect(parsePdfDate('2025-12-15')).toBe('2025-12-15');
    expect(parsePdfDate('20251215')).toBe('2025-12-15');
  });

  it('should return undefined for invalid date', () => {
    expect(parsePdfDate('invalid')).toBeUndefined();
    expect(parsePdfDate('')).toBeUndefined();
    expect(parsePdfDate(undefined)).toBeUndefined();
  });
});

describe('parsePdfInfoOutput', () => {
  it('should extract metadata from pdfinfo output', () => {
    const output = [
      'Title: Quarterly Report',
      'Author: Jane Doe',
      'Keywords: report, quarterly, finance',
      'CreationDate: D:20251215103000Z',
      'ModDate: D:20260110140000Z',
    ].join('\n');

    const result = parsePdfInfoOutput(output);
    expect(result).toEqual({
      title: 'Quarterly Report',
      author: 'Jane Doe',
      created: '2025-12-15',
      modified: '2026-01-10',
      tags: ['report', 'quarterly', 'finance'],
    });
  });

  it('should ignore unknown or empty values', () => {
    const output = [
      'Title: unknown',
      'Author: ',
      'Keywords: ',
    ].join('\n');

    const result = parsePdfInfoOutput(output);
    expect(result).toEqual({});
  });
});
