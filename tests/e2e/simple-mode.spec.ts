import { test, expect } from '@playwright/test';
import path from 'path';

const samplePdf = path.resolve(__dirname, '../../Sample Files/document_direct.pdf');
const sampleDkv = path.resolve(__dirname, '../../Sample Files/Ola_Report_2026-06-08 (2).xlsx');
const sampleGps = path.resolve(__dirname, '../../Sample Files/GPS 1.xls');

test.describe('Simple Mode browser workflows', () => {
  test('AS24 upload completes with correct registrations and finite spinner', async ({ page }) => {
    await page.goto('/as24-check');
    await expect(page.getByRole('heading', { name: /AS24 PDF Ingestion Check/i })).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(samplePdf);

    await expect(page.getByText(/File Upload Summary|Upload failed/i)).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('.animate-spin')).toHaveCount(0);

    const body = await page.textContent('body');
    expect(body).toContain('241MH244');
    expect(body).toContain('241MH243');
    expect(body).not.toContain('241MH2440');
    expect(body).not.toContain('241MH2520');
  });

  test('AS24 page uses compact fleet vehicle table', async ({ page }) => {
    await page.goto('/as24-check');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(samplePdf);
    await expect(page.getByText('Fleet Vehicles Identified')).toBeVisible({ timeout: 120_000 });
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
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(samplePdf);
    await expect(page.locator('table')).toBeVisible({ timeout: 120_000 });
    const regCell = page.locator('table tbody tr td').first();
    const color = await regCell.evaluate((el) => getComputedStyle(el.querySelector('span') || el).color);
    expect(color).not.toBe('rgb(255, 255, 255)');
    const bg = await page.locator('table').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBeTruthy();
  });

  test('DKV upload completes finitely', async ({ page }) => {
    await page.goto('/dkv-check');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(sampleDkv);
    await expect(page.getByText(/File Upload Summary|Upload failed/i)).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('.animate-spin')).toHaveCount(0);
  });

  test('invalid PDF shows finite error without endless spinner', async ({ page }) => {
    await page.goto('/as24-check');
    const tmp = path.resolve(__dirname, '../../inspect_tmp/invalid.pdf');
    const fs = await import('fs');
    fs.writeFileSync(tmp, '%PDF-1.4\nnot a real invoice');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(tmp);
    await expect(page.getByText(/Upload failed|No transactions|could not be read/i)).toBeVisible({ timeout: 60_000 });
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