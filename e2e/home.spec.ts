import { expect, test } from '@playwright/test';

test('home page has title and create options', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /EasySheets/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /Create blank sheet/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /Upload CSV/i })).toBeVisible();
});

test('create blank sheet redirects to editor', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Create blank sheet/i }).click();
	await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 });
	await expect(page.getByRole('button', { name: /Add column/i })).toBeVisible();
	await expect(page.getByRole('button', { name: /Add row/i })).toBeVisible();
});

test('create blank sheet opens Add Column modal', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Create blank sheet/i }).click();
	await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 });
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible({ timeout: 5000 });
	await expect(dialog.getByRole('heading', { name: /Add column/i })).toBeVisible();
	await expect(dialog.getByLabel('Name')).toBeVisible();
});

test('upload CSV redirects to editor with data', async ({ page }) => {
	await page.goto('/');
	const csv = `Name,Age,City
Alice,30,NYC
Bob,25,LA`;
	await page.locator('input[type="file"]').setInputFiles({
		name: 'test.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(csv)
	});
	await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 });
	await expect(page.getByRole('button', { name: /Add row/i })).toBeVisible();
	await expect(page.getByText('Name')).toBeVisible({ timeout: 5000 });
	await expect(page.getByText('Age')).toBeVisible();
	await expect(page.getByText('City')).toBeVisible();
});
