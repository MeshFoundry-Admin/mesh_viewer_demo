import { test, expect } from '@playwright/test';

test.describe('Mesh Viewer Demo smoke', () => {
  test('loads landing page shell', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /mesh viewer demo/i })).toBeVisible();
  });
});
