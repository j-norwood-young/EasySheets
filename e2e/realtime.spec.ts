import { expect, test } from '@playwright/test';

test('edit in one tab appears in another', async ({ page, context }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Create blank sheet/i }).click();
	await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 });
	await page.getByRole('button', { name: /Add column/i }).click();
	await page.getByLabel('Name').fill('Value');
	await page.getByRole('button', { name: 'Add' }).click();
	await page.getByRole('button', { name: /Add row/i }).click();

	const editorUrl = page.url();
	const tab2 = await context.newPage();
	await tab2.goto(editorUrl);

	const cell = page.locator('tbody input').first();
	await cell.fill('synced');
	await cell.blur();

	await expect(tab2.locator('tbody input').first()).toHaveValue('synced', { timeout: 5000 });
});
