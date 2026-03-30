import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { cells, rows, columns } from '$lib/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolvePermission, allows } from '$lib/server/permissions'
import { getToken } from '$lib/server/api-utils'
import { broadcast } from '$lib/server/sse/channel'

export const PATCH: RequestHandler = async ({ params, request }) => {
	const sheetId = params.sheetId
	const token = getToken(request)
	const { permission, ok } = await resolvePermission(sheetId, token)
	if (!ok) return json({ error: 'Forbidden' }, { status: 403 })

	const canEditAny = allows(permission, 'edit')
	const canEditOwnAppend = permission === 'append' && token && token.length > 0
	if (!canEditAny && !canEditOwnAppend) return json({ error: 'Forbidden' }, { status: 403 })

	const body = await request.json().catch(() => ({}))
	const rowId = body.rowId as string | undefined
	const columnId = body.columnId as string | undefined
	const value = typeof body.value === 'string' ? body.value : String(body.value ?? '')

	if (!rowId || !columnId) return json({ error: 'rowId and columnId required' }, { status: 400 })

	// Verify row and column belong to sheet
	const [row] = await db
		.select()
		.from(rows)
		.where(and(eq(rows.id, rowId), eq(rows.sheetId, sheetId)))
		.limit(1)
	const [col] = await db
		.select()
		.from(columns)
		.where(and(eq(columns.id, columnId), eq(columns.sheetId, sheetId)))
		.limit(1)
	if (!row || !col) return json({ error: 'Not found' }, { status: 404 })

	// Append permission can only edit rows they created (same share token)
	if (!canEditAny && canEditOwnAppend) {
		if (row.createdByToken !== token) return json({ error: 'Forbidden' }, { status: 403 })
	}

	await db
		.insert(cells)
		.values({ rowId, columnId, value })
		.onConflictDoUpdate({
			target: [cells.rowId, cells.columnId],
			set: { value },
		})
	broadcast(sheetId)
	return json({ ok: true })
}
