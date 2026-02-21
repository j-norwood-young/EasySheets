import { expect, test } from '@playwright/test';

test('read-only shared view has no add/edit buttons', async ({ page, context }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Create blank sheet/i }).click();
	await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 });
	await page.getByRole('button', { name: /Add column/i }).click();
	await page.getByLabel('Name').fill('Col');
	await page.getByRole('button', { name: 'Add' }).click();
	await page.getByRole('button', { name: /Share/i }).click();
	// Copy read link - first row is "read"
	const readRow = page.locator('li').filter({ hasText: 'read' });
	await readRow.getByRole('button', { name: /Copy link/i }).click();
	const readLink = await page.evaluate(() => navigator.clipboard.readText());
	expect(readLink).toMatch(/\/s\/[^/]+/);

	const shared = await context.newPage();
	await shared.goto(readLink);
	await expect(shared.getByText(/read access/i)).toBeVisible();
	await expect(shared.getByRole('button', { name: /Add row/i })).not.toBeVisible();
});

test('append shared view can add row', async ({ page, context }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Create blank sheet/i }).click();
	await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 });
	await page.getByRole('button', { name: /Add column/i }).click();
	await page.getByLabel('Name').fill('X');
	await page.getByRole('button', { name: 'Add' }).click();
	await page.getByRole('button', { name: /Share/i }).click();
	const appendRow = page.locator('li').filter({ hasText: 'append' });
	await appendRow.getByRole('button', { name: /Copy link/i }).click();
	const link = await page.evaluate(() => navigator.clipboard.readText());

	const shared = await context.newPage();
	await shared.goto(link);
	await expect(shared.getByRole('button', { name: /Add row/i })).toBeVisible();
	await shared.getByRole('button', { name: /Add row/i }).click();
	await expect(shared.locator('tbody tr')).toHaveCount(1);
});
