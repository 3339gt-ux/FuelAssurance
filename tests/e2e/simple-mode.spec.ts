import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const samplePdf = path.resolve(__dirname, '../../Sample Files/document_direct.pdf');
const sampleDkv = path.resolve(__dirname, '../../Sample Files/Ola_Report_2026-06-08 (2).xlsx');

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === '.xls') return 'application/vnd.ms-excel';
  return 'application/octet-stream';
}

async function triggerDevUpload(
  page: Page,
  hookName: '__testUploadAs24Pdf' | '__testUploadDkv',
  filePath: string
): Promise<void> {
  expect(fs.existsSync(filePath), `fixture missing: ${filePath}`).toBe(true);
  const b64 = fs.readFileSync(filePath).toString('base64');
  const name = path.basename(filePath);
  const mimeType = mimeFor(filePath);

  const uploadPromise = page.waitForResponse(
    (res) => res.url().includes('/api/upload') && res.request().method() === 'POST',
    { timeout: 180_000 }
  );

  await page.waitForFunction(
    (hook) => typeof (window as unknown as Record<string, unknown>)[hook] === 'function',
    hookName,
    { timeout: 30_000 }
  );

  await page.evaluate(
    async ({ hook, b64Data, fileName, fileMime }) => {
      const bin = atob(b64Data);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], fileName, { type: fileMime });
      const hookFn = (window as unknown as Record<string, ((f: File) => Promise<void>) | undefined>)[hook];
      if (!hookFn) throw new Error(`Dev upload hook ${hook} not available`);
      await hookFn(file);
    },
    { hook: hookName, b64Data: b64, fileName: name, fileMime: mimeType }
  );

  const response = await uploadPromise;
  expect([200, 422].includes(response.status())).toBeTruthy();
}

async function waitForUploadComplete(page: Page): Promise<void> {
  await expect(
    page.getByText('File Upload Summary').or(page.getByText('Upload failed'))
  ).toBeVisible({ timeout: 180_000 });
  await expect(page.locator('.animate-spin')).toHaveCount(0);
}

test.describe.configure({ mode: 'serial' });

test.describe('Simple Mode browser workflows', () => {
  test('AS24 upload completes with correct registrations and finite spinner', async ({ page }) => {
    await page.goto('/as24-check');
    await expect(page.getByRole('heading', { name: /AS24 PDF Ingestion Check/i })).toBeVisible();

    await triggerDevUpload(page, '__testUploadAs24Pdf', samplePdf);
    await waitForUploadComplete(page);

    const body = await page.textContent('body');
    expect(body).toContain('241MH244');
    expect(body).toContain('241MH243');
    expect(body).not.toContain('241MH2440');
    expect(body).not.toContain('241MH2520');
  });

  test('AS24 page uses compact fleet vehicle table', async ({ page }) => {
    await page.goto('/as24-check');
    await triggerDevUpload(page, '__testUploadAs24Pdf', samplePdf);
    await waitForUploadComplete(page);

    await expect(page.getByText('Fleet Vehicles Identified')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th', { hasText: 'Vehicle' })).toBeVisible();
  });

  test('Dark mode table text remains readable', async ({ page }) => {
    await page.goto('/settings');
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('fuel-assurance-theme', 'dark');
    });
    await page.goto('/as24-check');
    await triggerDevUpload(page, '__testUploadAs24Pdf', samplePdf);
    await waitForUploadComplete(page);

    await expect(page.locator('table')).toBeVisible();
    const regCell = page.locator('table tbody tr td').first();
    const color = await regCell.evaluate((el) => getComputedStyle(el.querySelector('span') || el).color);
    expect(color).not.toBe('rgb(255, 255, 255)');
    const bg = await page.locator('table').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBeTruthy();
  });

  test('DKV upload completes finitely', async ({ page }) => {
    await page.goto('/dkv-check');
    await triggerDevUpload(page, '__testUploadDkv', sampleDkv);
    await waitForUploadComplete(page);
  });

  test('invalid PDF shows finite error without endless spinner', async ({ page }) => {
    await page.goto('/as24-check');
    const tmp = path.resolve(__dirname, '../../inspect_tmp/invalid-e2e.pdf');
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, '%PDF-1.4\n% not a valid as24 invoice structure\n');

    await triggerDevUpload(page, '__testUploadAs24Pdf', tmp);
    await expect(page.getByText('Upload failed')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.animate-spin')).toHaveCount(0);
  });

  test('navigation between simple pages stays fast', async ({ page }) => {
    const routes = ['/', '/dkv-check', '/as24-check', '/previous-results', '/settings'];
    for (const route of routes) {
      const start = Date.now();
      await page.goto(route);
      await expect(page.locator('body')).toBeVisible();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    }
  });
});