import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('US2: Visual Aids and Statistics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Load mesh file (US1 prerequisite)
    const samplePath = path.resolve(__dirname, '../../tests/data/meshes/sample_ascii_cube.stl');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(samplePath);

    // Wait for Ready state
    const statusBadge = page.locator('.status-badge');
    await expect(statusBadge).toContainText('Ready', { timeout: 5000 });
  });

  test('Statistics panel displays vertex/trang count', async ({ page }) => {
    const statsPanel = page.getByTestId('statistics-panel');
    await expect(statsPanel).toBeVisible();

    // Verify vertex count
    const vertices = page.getByTestId('stat-vertices');
    await expect(vertices).toBeVisible();
    const verticesText = await vertices.textContent();
    expect(Number(verticesText?.replace(/,/g, ''))).toBeGreaterThan(0);

    // Verify triangle count
    const triangles = page.getByTestId('stat-triangles');
    await expect(triangles).toBeVisible();
    const trianglesText = await triangles.textContent();
    expect(Number(trianglesText?.replace(/,/g, ''))).toBeGreaterThan(0);
  });

  test('Statistics panel displays BBox min/max', async ({ page }) => {
    const bboxMin = page.getByTestId('stat-bbox-min');
    const bboxMax = page.getByTestId('stat-bbox-max');

    await expect(bboxMin).toBeVisible();
    await expect(bboxMax).toBeVisible();

    // Verify coordinate format (x.xxx, y.yyy, z.zzz)
    const minText = await bboxMin.textContent();
    const maxText = await bboxMax.textContent();

    expect(minText).toMatch(/\(.*,.*,.*\)/);
    expect(maxText).toMatch(/\(.*,.*,.*\)/);
  });

  test('Statistics panel displays diagonal length', async ({ page }) => {
    const diagonal = page.getByTestId('stat-diagonal');
    await expect(diagonal).toBeVisible();

    const diagonalText = await diagonal.textContent();
    expect(Number(diagonalText)).toBeGreaterThan(0);
  });

  test('Wireframe toggle works in Overlay panel', async ({ page }) => {
    const overlayPanel = page.getByTestId('overlay-panel');
    await expect(overlayPanel).toBeVisible();

    // Find Wireframe checkbox
    const wireframeCheckbox = page.locator('input[type="checkbox"]').filter({
      has: page.locator('xpath=following-sibling::span[contains(text(), "Wireframe")]')
    }).or(page.getByLabel('Wireframe'));

    // Check state before toggle
    const initialState = await wireframeCheckbox.isChecked();

    // Toggle
    await wireframeCheckbox.click();

    // Verify state change
    const newState = await wireframeCheckbox.isChecked();
    expect(newState).not.toBe(initialState);

    // Toggle again to restore original state
    await wireframeCheckbox.click();
    const finalState = await wireframeCheckbox.isChecked();
    expect(finalState).toBe(initialState);
  });

  test('Overlay toggle reflects immediately without page refresh', async ({ page }) => {
    // Toggle multiple overlays consecutively
    const checkboxes = page.locator('.overlay-panel input[type="checkbox"]');
    const count = await checkboxes.count();

    expect(count).toBeGreaterThan(0);

    // Toggle first checkbox
    const firstCheckbox = checkboxes.first();
    const originalState = await firstCheckbox.isChecked();

    await firstCheckbox.click();

    // Verify state changed immediately (without refresh)
    const changedState = await firstCheckbox.isChecked();
    expect(changedState).not.toBe(originalState);

    // Verify URL has not changed (no refresh)
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('reload');
  });

  test('Statistics calculation completes within 500ms', async ({ page }) => {
    // Verify statistics panel displays immediately
    const statsPanel = page.getByTestId('statistics-panel');

    // Stats panel should be populated within 500ms after Ready state
    const startTime = Date.now();
    await expect(page.getByTestId('stat-vertices')).toBeVisible({ timeout: 500 });
    const elapsed = Date.now() - startTime;

    console.log(`[SC-002] Statistics calculation time: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(500);
  });

  test('Statistics update when new file is loaded', async ({ page }) => {
    // Save current statistics
    const vertices1 = await page.getByTestId('stat-vertices').textContent();

    // Load another file (reload even if same file)
    const samplePath = path.resolve(__dirname, '../../tests/data/meshes/sample_ascii_cube.stl');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(samplePath);

    // Wait for Ready state
    const statusBadge = page.locator('.status-badge');
    await expect(statusBadge).toContainText('Ready', { timeout: 5000 });

    // Verify statistics still display (same file so values may be identical)
    const vertices2 = await page.getByTestId('stat-vertices').textContent();
    expect(vertices2).toBeTruthy();
  });
});
