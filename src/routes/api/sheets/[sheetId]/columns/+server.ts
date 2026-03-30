import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { columns } from '$lib/server/db/schema'
import type { ColumnType, ColumnFormat } from '$lib/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolvePermission, allows } from '$lib/server/permissions'
import { getToken } from '$lib/server/api-utils'
import { broadcast } from '$lib/server/sse/channel'
import { nanoid } from 'nanoid'

function serializeFormat(format: unknown): string | null {
	if (format == null || typeof format !== 'object') return null
	const o = format as Record<string, unknown>
	const f: ColumnFormat = {}
	if (typeof o.currencySymbol === 'string') f.currencySymbol = o.currencySymbol
	if (typeof o.decimalPlaces === 'number') f.decimalPlaces = o.decimalPlaces
	if (typeof o.thousandsSeparator === 'boolean') f.thousandsSeparator = o.thousandsSeparator
	return Object.keys(f).length ? JSON.stringify(f) : null
}

export const POST: RequestHandler = async ({ params, request }) => {
	const sheetId = params.sheetId
	const token = getToken(request)
	const { permission, ok } = await resolvePermission(sheetId, token)
	if (!ok || !allows(permission, 'edit')) return json({ error: 'Forbidden' }, { status: 403 })

	const body = await request.json().catch(() => ({}))
	const name = typeof body.name === 'string' ? body.name.trim() : ''
	const type = (body.type as ColumnType) ?? 'string'
	const formatJson = serializeFormat(body.format)
	if (!name) return json({ error: 'Name required' }, { status: 400 })

	const existing = await db.select().from(columns).where(eq(columns.sheetId, sheetId))
	const order = existing.length
	const id = nanoid()
	await db.insert(columns).values({
		id,
		sheetId,
		name,
		type: type as ColumnType,
		order,
		format: formatJson,
		width: null,
	})
	broadcast(sheetId)
	const format = formatJson ? (JSON.parse(formatJson) as ColumnFormat) : null
	return json({ id, name, type, order, format, width: null }, { status: 201 })
}

export const PATCH: RequestHandler = async ({ params, request }) => {
	const sheetId = params.sheetId
	const token = getToken(request)
	const { permission, ok } = await resolvePermission(sheetId, token)
	if (!ok || !allows(permission, 'edit')) return json({ error: 'Forbidden' }, { status: 403 })

	const body = await request.json().catch(() => ({}))
	const order = body.order as string[] | undefined
	if (!Array.isArray(order) || order.length === 0)
		return json({ error: 'Bad request: order array required' }, { status: 400 })

	const sheetColumns = await db
		.select({ id: columns.id })
		.from(columns)
		.where(eq(columns.sheetId, sheetId))
	const sheetColumnIds = new Set(sheetColumns.map((c) => c.id))
	for (const id of order) {
		if (!sheetColumnIds.has(id)) return json({ error: 'Invalid column id' }, { status: 400 })
	}

	for (let i = 0; i < order.length; i++) {
		await db
			.update(columns)
			.set({ order: i })
			.where(and(eq(columns.id, order[i]), eq(columns.sheetId, sheetId)))
	}
	broadcast(sheetId)
	return json({ ok: true })
}
