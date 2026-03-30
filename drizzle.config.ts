import { defineConfig } from 'drizzle-kit'

const dbPath = process.env.DB_PATH ?? './data/sqlite.db'
const url = dbPath.startsWith('file:') ? dbPath : `file:${dbPath}`

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: { url },
	out: './drizzle',
})
