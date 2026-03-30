import { defineConfig } from '@playwright/test'

export default defineConfig({
	webServer: {
		command: 'pnpm db:migrate && pnpm run build && pnpm run preview',
		port: 4173,
		env: { DB_PATH: 'file:./data/sqlite.db' },
	},
	testDir: 'e2e',
	globalSetup: 'e2e/global-setup.ts',
	fullyParallel: false,
})
