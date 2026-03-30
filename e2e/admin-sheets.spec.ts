import { expect, test } from '@playwright/test'

test.describe('admin sheets (localStorage + share)', () => {
	test('your sheets section appears after creating a sheet and returning home', async ({
		page,
	}) => {
		await page.goto('/')
		await page.getByRole('button', { name: /Create blank sheet/i }).click()
		await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 })
		const sheetUrl = page.url()

		await page.getByRole('link', { name: /Home/i }).click()
		await expect(page).toHaveURL('/')

		await expect(page.getByRole('heading', { name: /Your sheets/i })).toBeVisible()
		await expect(page.getByText(/Sheets you've created or edited/)).toBeVisible()
		// At least one sheet link (Untitled or path)
		const sheetLink = page.getByRole('link', { name: /Untitled sheet|\/sheets\// }).first()
		await expect(sheetLink).toBeVisible()
		await sheetLink.click()
		await expect(page).toHaveURL(/\/sheets\/[^/]+/)
		await expect(page.getByRole('button', { name: /Add row/i })).toBeVisible()
	})

	test('your sheets lists multiple sheets ordered by last opened', async ({ page }) => {
		await page.goto('/')
		// Create first sheet
		await page.getByRole('button', { name: /Create blank sheet/i }).click()
		await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 })
		const firstId = page.url().split('/sheets/')[1]?.split('?')[0] ?? ''
		await page.getByRole('link', { name: /Home/i }).click()
		await expect(page).toHaveURL('/')

		// Create second sheet
		await page.getByRole('button', { name: /Create blank sheet/i }).click()
		await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 })
		const secondId = page.url().split('/sheets/')[1]?.split('?')[0] ?? ''
		await page.getByRole('link', { name: /Home/i }).click()
		await expect(page).toHaveURL('/')

		// Most recently opened (second) should appear first in the list
		const links = page.getByRole('link', { name: /Untitled sheet|\/sheets\// })
		await expect(links.first()).toHaveAttribute('href', `/sheets/${secondId}`)
		await expect(links.nth(1)).toHaveAttribute('href', `/sheets/${firstId}`)
	})

	test('share modal shows Admin row with Open and Copy link', async ({ page }) => {
		await page.goto('/')
		await page.getByRole('button', { name: /Create blank sheet/i }).click()
		await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 })

		await page.getByRole('button', { name: /Share/i }).click()
		const dialog = page.getByRole('dialog')
		await expect(dialog).toBeVisible()
		await expect(dialog.getByText('Admin')).toBeVisible()
		await expect(dialog.getByRole('link', { name: 'Open' })).toBeVisible()
		await expect(dialog.getByRole('button', { name: /Copy link/i })).toBeVisible()

		// Admin Open link goes to current sheet
		const adminOpen = dialog.getByRole('link', { name: 'Open' })
		await expect(adminOpen).toHaveAttribute('href', new RegExp(`/sheets/[^/]+`))
	})

	test('copy admin link copies full sheet URL', async ({ page, context }) => {
		await page.goto('/')
		await page.getByRole('button', { name: /Create blank sheet/i }).click()
		await page.waitForURL(/\/sheets\/[^/]+/, { timeout: 15000 })
		const sheetPath = new URL(page.url()).pathname

		await page.getByRole('button', { name: /Share/i }).click()
		const dialog = page.getByRole('dialog')
		await expect(dialog.getByText('Admin')).toBeVisible()
		await context.grantPermissions(['clipboard-read'])
		// Admin row is the first list item; click its Copy link button
		await dialog
			.locator('li')
			.filter({ hasText: 'Admin' })
			.getByRole('button', { name: /Copy link/i })
			.click()
		await expect(
			dialog
				.locator('li')
				.filter({ hasText: 'Admin' })
				.getByRole('button', { name: 'Copied!' })
		).toBeVisible()

		const copied = await page.evaluate(() => navigator.clipboard.readText())
		expect(copied).toMatch(/\/sheets\/[^/]+/)
		expect(copied.endsWith(sheetPath) || copied.includes(sheetPath)).toBe(true)
	})
})
