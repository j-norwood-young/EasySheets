import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema.js'

const url = process.env.DB_PATH ?? 'file:./data/sqlite.db'
const client = createClient({
	url: url.startsWith('file:') ? url : `file:${url}`,
})
const db = drizzle(client, { schema })

export { db, client }
