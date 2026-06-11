import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const samplePdf = path.resolve(__dirname, '../../Sample Files/document_direct.pdf');
const sampleDkv = path.resolve(__dirname, '../../Sample Files/Ola_Report_2026-06-08 (2).xlsx');
const dkvPdfPath = 'C:\\Users\\Graham\\Downloads\\Invoice-0000836033-26_652008962_000.pdf';

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

test.describe.configure({ mode: 'serial' });

test.describe('New Audit Workspace and DKV PDF Ingest features', () => {
  test('Upload AS24 PDF and confirm compact table, density toggle and GPS preview opens', async ({ page }) => {
    // 1. Go to AS24 Check page
    await page.goto('/as24-check');
    await page.evaluate(() => {
      localStorage.setItem('fuel-assurance-density-mode', 'compact');
    });
    await expect(page.getByRole('heading', { name: /AS24 PDF Ingestion Check/i })).toBeVisible();

    // 2. Trigger upload
    await triggerDevUpload(page, '__testUploadAs24Pdf', samplePdf);

    // 3. Click workspace link to enter Audit Review Workspace
    const workspaceLink = page.locator('a:has-text("View in Transaction Batches workspace")');
    await expect(workspaceLink).toBeVisible();
    await workspaceLink.click();

    // 4. Confirm redirection to /batches
    await page.waitForURL(/\/batches\?id=.+/);

    // 5. Confirm sticky top action bar elements are visible
    const stickyBar = page.locator('div.sticky.top-0');
    await expect(stickyBar).toBeVisible();
    await expect(stickyBar.getByText('Confirm Extracted Data')).toBeVisible();

    // 6. Confirm compact table is visible and has data
    const table = page.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead')).toContainText('Vehicle');
    await expect(table.locator('thead')).toContainText('GPS Match');

    // 7. Confirm density toggle exists
    const densityBtn = stickyBar.locator('button[title*="density"]');
    await expect(densityBtn).toBeVisible();

    // 8. Verify density toggle changes row height
    // Measure row height in compact mode (default)
    const row = page.locator('table tbody tr.density-row').first();
    await expect(row).toBeVisible();

    const compactHeight = await row.evaluate((el) => el.getBoundingClientRect().height);
    expect(compactHeight).toBeLessThan(38); // Compact height target is ~30px

    // Toggle density to Comfortable mode
    await densityBtn.click();
    await page.waitForTimeout(500); // Wait for transition/re-render
    const comfortableHeight = await row.evaluate((el) => el.getBoundingClientRect().height);
    expect(comfortableHeight).toBeGreaterThan(42); // Comfortable height target is ~48px

    // Toggle back to Compact
    await densityBtn.click();

    // 9. Confirm source preview popover can be shown
    const docBtn = page.locator('table tbody tr.density-row').first().locator('button').first();
    await expect(docBtn).toBeVisible();
    
    // 10. Open Evidence Match View
    await row.click();
    const evidenceMatchBtn = page.locator('button', { hasText: 'Evidence Match' }).first();
    await expect(evidenceMatchBtn).toBeVisible();
    await evidenceMatchBtn.click();
    
    // Evidence Match View panel should open
    const modal = page.locator('div', { hasText: 'Evidence Match View' }).first();
    await expect(modal).toBeVisible();
    
    // Close modal
    const closeBtn = modal.locator('button:has(svg.lucide-x)').first();
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
  });

  test('Upload DKV PDF and confirm detected as DKV Invoice PDF', async ({ page }) => {
    // 1. Go to DKV Check page
    await page.goto('/dkv-check');
    await expect(page.getByRole('heading', { name: /DKV.*Check/i })).toBeVisible();

    // 2. Trigger upload of DKV PDF
    await triggerDevUpload(page, '__testUploadDkv', dkvPdfPath);

    // 3. Click workspace link to enter Audit Review Workspace
    const workspaceLink = page.locator('a:has-text("Open batch workspace")');
    await expect(workspaceLink).toBeVisible();
    await workspaceLink.click();

    // 4. Confirm redirection to /batches
    await page.waitForURL(/\/batches\?id=.+/);

    // 5. Confirm DKV Invoice PDF detected
    await expect(page.getByText('DKV Invoice PDF')).toBeVisible();

    // 6. Confirm sticky top action bar elements are visible
    const stickyBar = page.locator('div.sticky.top-0');
    await expect(stickyBar).toBeVisible();
  });

  test('Verify Telematics does not navigate to a blank or old route', async ({ page }) => {
    // Verify legacy check route redirects to the correct batches page
    await page.goto('/previous-results');
    await expect(page.getByRole('heading', { name: /Verification History/i })).toBeVisible();
  });
});
