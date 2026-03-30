import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
	await page.goto('/')
	await page.getByRole('button', { name: /Create blank sheet/i }).click()
	await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 })
})

test('add column and add row', async ({ page }) => {
	await page.getByRole('button', { name: /Add column/i }).click()
	await page.getByLabel('Name').fill('Score')
	await page.getByRole('combobox', { name: /Type/i }).selectOption('number')
	await page.getByRole('button', { name: 'Add' }).click()
	await expect(page.getByRole('columnheader', { name: 'Score' })).toBeVisible()

	await page.getByRole('button', { name: /Add row/i }).click()
	await expect(page.getByRole('cell', { name: '—' }).first()).toBeVisible()
})

test('edit cell', async ({ page }) => {
	await page.getByRole('button', { name: /Add column/i }).click()
	await page.getByLabel('Name').fill('A')
	await page.getByRole('button', { name: 'Add' }).click()
	await page.getByRole('button', { name: /Add row/i }).click()
	const cell = page.locator('tbody input').first()
	await cell.fill('hello')
	await cell.blur()
	await expect(cell).toHaveValue('hello')
})

test('share panel shows Admin and permission links', async ({ page }) => {
	await page.getByRole('button', { name: /Share/i }).click()
	await expect(page.getByText('Share links')).toBeVisible()
	await expect(page.getByText('Admin')).toBeVisible()
	await expect(page.getByText('read')).toBeVisible()
	await expect(page.getByText('append')).toBeVisible()
	await expect(page.getByText('edit')).toBeVisible()
	await expect(page.getByText('delete')).toBeVisible()
})
