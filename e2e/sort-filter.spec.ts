import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	const csv = `A,B
2,beta
1,alpha
3,gamma`;
	await page.locator('input[type="file"]').setInputFiles({
		name: 't.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(csv)
	});
	await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 });
	await expect(page.getByText('A')).toBeVisible({ timeout: 5000 });
});

test('admin view shows rows in CSV order', async ({ page }) => {
	// Rows appear in import order (order_num): 2,beta then 1,alpha then 3,gamma
	await expect(page.locator('tbody tr').first()).toContainText('2');
	await expect(page.locator('tbody tr').first()).toContainText('beta');
	await expect(page.locator('tbody tr')).toHaveCount(3);
});

test('admin view has drag handle for reordering rows', async ({ page }) => {
	// First column is the reorder handle (grip icon)
	await expect(page.locator('thead th').first()).toHaveAttribute('aria-label', 'Reorder');
});
