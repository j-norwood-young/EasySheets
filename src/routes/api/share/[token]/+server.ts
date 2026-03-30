import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { shareLinks, sheets } from '$lib/server/db/schema'
import { eq } from 'drizzle-orm'

export const GET: RequestHandler = async ({ params }) => {
	const token = params.token
	const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1)
	if (!link) return json({ error: 'Not found' }, { status: 404 })

	const [sheet] = await db.select().from(sheets).where(eq(sheets.id, link.sheetId)).limit(1)
	if (!sheet) return json({ error: 'Not found' }, { status: 404 })

	return json({
		sheetId: sheet.id,
		name: sheet.name,
		permission: link.permission,
	})
}
