import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { columns } from '$lib/server/db/schema'
import type { ColumnType, ColumnFormat } from '$lib/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolvePermission, allows } from '$lib/server/permissions'
import { getToken } from '$lib/server/api-utils'
import { broadcast } from '$lib/server/sse/channel'

function serializeFormat(format: unknown): string | null {
	if (format == null || typeof format !== 'object') return null
	const o = format as Record<string, unknown>
	const f: ColumnFormat = {}
	if (typeof o.currencySymbol === 'string') f.currencySymbol = o.currencySymbol
	if (typeof o.decimalPlaces === 'number') f.decimalPlaces = o.decimalPlaces
	if (typeof o.thousandsSeparator === 'boolean') f.thousandsSeparator = o.thousandsSeparator
	return Object.keys(f).length ? JSON.stringify(f) : null
}

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { sheetId, columnId } = params
	const token = getToken(request)
	const { permission, ok } = await resolvePermission(sheetId, token)
	if (!ok || !allows(permission, 'edit')) return json({ error: 'Forbidden' }, { status: 403 })

	const [col] = await db
		.select()
		.from(columns)
		.where(and(eq(columns.id, columnId), eq(columns.sheetId, sheetId)))
		.limit(1)
	if (!col) return json({ error: 'Not found' }, { status: 404 })

	const body = await request.json().catch(() => ({}))
	const updates: {
		name?: string
		type?: ColumnType
		format?: string | null
		width?: number | null
	} = {}
	if (typeof body.name === 'string' && body.name.trim() !== '') updates.name = body.name.trim()
	if (body.type !== undefined) updates.type = (body.type as ColumnType) ?? 'string'
	if (body.format !== undefined) updates.format = serializeFormat(body.format)
	if (body.width !== undefined) {
		const raw = Number(body.width)
		if (Number.isFinite(raw)) {
			const MIN_COL_WIDTH = 80
			const MAX_COL_WIDTH = 600
			let w = Math.round(raw)
			if (w < MIN_COL_WIDTH) w = MIN_COL_WIDTH
			if (w > MAX_COL_WIDTH) w = MAX_COL_WIDTH
			updates.width = w
		}
	}

	if (Object.keys(updates).length === 0) return json({ ok: true })

	await db.update(columns).set(updates).where(eq(columns.id, columnId))
	broadcast(sheetId)
	return json({ ok: true })
}

export const DELETE: RequestHandler = async ({ params, request }) => {
	const { sheetId, columnId } = params
	const token = getToken(request)
	const { permission, ok } = await resolvePermission(sheetId, token)
	if (!ok || !allows(permission, 'edit')) return json({ error: 'Forbidden' }, { status: 403 })

	const [col] = await db
		.select()
		.from(columns)
		.where(and(eq(columns.id, columnId), eq(columns.sheetId, sheetId)))
		.limit(1)
	if (!col) return json({ error: 'Not found' }, { status: 404 })

	await db.delete(columns).where(eq(columns.id, columnId))
	broadcast(sheetId)
	return json({ ok: true })
}
