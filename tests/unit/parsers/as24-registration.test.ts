import { describe, it, expect } from 'vitest';
import fs from 'fs';
import pdf from 'pdf-parse';
import { hasLocalSampleFiles, samplePath } from '../../helpers/fixtures';
import {
  parseCardsFillingRegistration,
  parsePassangoRegistration,
  extractAS24RegistrationsFromText,
} from '@/domain/parsers/as24/registration-extractor';
import { parseAS24PDF } from '@/domain/parsers/as24/as24-pdf-parser';

describe('AS24 section-aware registration extraction', () => {
  it('parses Cards Filling headings without appending trailing fields', () => {
    expect(parseCardsFillingRegistration('241 MH 244 0')).toEqual({
      registration: '241MH244',
      followingField: '0',
      odometer: '0',
    });
    expect(parseCardsFillingRegistration('241 MH 2440')).toEqual({
      registration: '241MH244',
      followingField: '0',
      odometer: '0',
    });
    expect(parseCardsFillingRegistration('252MH1819 0')).toEqual({
      registration: '252MH1819',
      followingField: '0',
      odometer: '0',
    });
    expect(parseCardsFillingRegistration('252MH18190')).toEqual({
      registration: '252MH1819',
      followingField: '0',
      odometer: '0',
    });
  });

  it('parses PASSango registration before Euroclass', () => {
    expect(parsePassangoRegistration('IE- 241MH243 6 078110082406062200011077794400018')).toEqual({
      registration: '241MH243',
      euroclass: '6',
      obuId: '0781100824',
    });
    expect(parsePassangoRegistration('IE-241MH244960')).toEqual({
      registration: '241MH244',
      euroclass: '9',
      obuId: '',
    });
  });

  it.skipIf(!hasLocalSampleFiles())('extracts expected registrations from sample AS24 PDF', async () => {
    const pdfPath = samplePath('document_direct.pdf');
    expect(fs.existsSync(pdfPath)).toBe(true);

    const buffer = fs.readFileSync(pdfPath);
    const pagesData: Array<{ pageNum: number; items: Array<{ str: string; x: number; y: number; width: number; height: number }> }> = [];
    const options = {
      pagerender: (pageData: { pageIndex: number; getTextContent: () => Promise<{ items: Array<{ str: string; transform: number[]; width: number; height: number }> }> }) =>
        pageData.getTextContent().then((tc) => {
          const items = tc.items.map((i) => ({
            str: i.str,
            x: i.transform[4]!,
            y: i.transform[5]!,
            width: i.width,
            height: i.height,
          }));
          pagesData.push({ pageNum: pageData.pageIndex + 1, items });
          return '';
        }),
    };

    const pdfData = await pdf(buffer, options);
    pagesData.sort((a, b) => a.pageNum - b.pageNum);
    const result = parseAS24PDF(pdfData.text, 'reg-test', pagesData);
    const regs = [...new Set(result.invoiceRows.map((r) => r.registration).filter(Boolean))].sort();

    const required = ['241MH243', '241MH244', '241MH252', '241MH255', '241MH258', '252MH1819'];
    for (const reg of required) {
      expect(regs, `missing ${reg}`).toContain(reg);
    }

    const forbidden = ['241MH2440', '241MH2520', '241MH2550', '241MH2580', '252MH18190', 'IE241MH243509', 'IE241MH244960'];
    for (const bad of forbidden) {
      expect(regs, `false positive ${bad}`).not.toContain(bad);
    }
  });

  it.skipIf(!hasLocalSampleFiles())('section-aware text scan never emits forbidden concatenated registrations', async () => {
    const pdfPath = samplePath('document_direct.pdf');
    const buffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(buffer);
    const extracted = extractAS24RegistrationsFromText(pdfData.text);
    const normalized = extracted.map((e) => e.normalized);

    expect(normalized).toContain('241MH244');
    expect(normalized).toContain('241MH243');
    expect(normalized).not.toContain('241MH2440');
    expect(normalized).not.toContain('IE241MH244960');
  });
});