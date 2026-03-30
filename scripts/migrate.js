/**
 * Run Drizzle migrations against the database.
 * Uses DB_PATH env; default matches src/lib/server/db/client.ts (file:./data/sqlite.db).
 */
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.join(__dirname, '..', 'drizzle')
const journalPath = path.join(migrationsFolder, 'meta', '_journal.json')
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
const tags = journal.entries.map((e) => e.tag).join(', ')
console.log('Migrations to apply (if needed):', tags)

// Match the default used by src/lib/server/db/client.ts so dev + migrations hit the same DB.
const url = process.env.DB_PATH ?? 'file:./data/sqlite.db'
console.log('Using DB_PATH:', url.replace(/^file:/, ''))

const client = createClient({
	url: url.startsWith('file:') ? url : `file:${url}`,
})
const db = drizzle(client)

await migrate(db, { migrationsFolder })

// Idempotent fix: ensure rows.created_by_token exists (in case 0003 was skipped or ran against another DB)
{
	const pragma = await client.execute('PRAGMA table_info(rows)')
	const cols = pragma.rows ?? []
	const hasCreatedByToken = cols.some((r) => (r.name ?? r[1]) === 'created_by_token')
	if (!hasCreatedByToken) {
		console.log('Adding missing column rows.created_by_token')
		await client.execute('ALTER TABLE "rows" ADD COLUMN "created_by_token" text')
	}
}

// Idempotent fix: ensure columns.width exists to match current Drizzle schema
{
	const pragmaCols = await client.execute('PRAGMA table_info(columns)')
	const colRows = pragmaCols.rows ?? []
	const hasWidth = colRows.some((r) => (r.name ?? r[1]) === 'width')
	if (!hasWidth) {
		console.log('Adding missing column columns.width')
		await client.execute('ALTER TABLE "columns" ADD COLUMN "width" integer')
	}
}

console.log('Migrations complete.')
