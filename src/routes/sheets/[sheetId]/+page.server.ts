import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import { db } from '$lib/server/db'
import { sheets, columns, rows, cells } from '$lib/server/db/schema'
import { eq, inArray } from 'drizzle-orm'

export const load: PageServerLoad = async ({ params, url }) => {
	const sheetId = params.sheetId
	const [sheet] = await db.select().from(sheets).where(eq(sheets.id, sheetId)).limit(1)
	if (!sheet) throw error(404, 'Sheet not found')

	const cols = await db
		.select()
		.from(columns)
		.where(eq(columns.sheetId, sheetId))
		.orderBy(columns.order, columns.id)

	const rowsList = await db
		.select()
		.from(rows)
		.where(eq(rows.sheetId, sheetId))
		.orderBy(rows.orderNum, rows.createdAt)

	const rowIds = rowsList.map((r) => r.id)
	const cellsList =
		rowIds.length > 0 ? await db.select().from(cells).where(inArray(cells.rowId, rowIds)) : []

	return {
		sheet: {
			id: sheet.id,
			name: sheet.name,
			createdAt: sheet.createdAt,
		},
		columns: cols,
		rows: rowsList.map((r) => ({
			id: r.id,
			sheetId: r.sheetId,
			createdAt: r.createdAt,
			orderNum: r.orderNum,
		})),
		cells: cellsList.map((c) => ({ rowId: c.rowId, columnId: c.columnId, value: c.value })),
	}
}
