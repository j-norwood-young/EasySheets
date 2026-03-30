import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { sheets, columns, rows, cells } from '$lib/server/db/schema'
import { nanoid } from 'nanoid'
import type { ColumnType } from '$lib/server/db/schema'
import Papa from 'papaparse'
import iconv from 'iconv-lite'
import { broadcast } from '$lib/server/sse/channel'

const REPLACEMENT_CHAR = '\uFFFD'

/** Decode raw CSV bytes as UTF-8, or Windows-1252 if UTF-8 yields replacement characters. */
function decodeCsvBytes(bytes: ArrayBuffer): string {
	const buf = Buffer.from(bytes)
	let s = buf.toString('utf8')
	if (s.includes(REPLACEMENT_CHAR)) s = iconv.decode(buf, 'win1252')
	return s
}

function inferType(values: string[]): ColumnType {
	let allNumber = true
	let allDate = true
	const dateRe = /^\d{4}-\d{2}-\d{2}/
	const dateTimeRe = /^\d{4}-\d{2}-\d{2}T|\d{4}-\d{2}-\d{2} \d{2}:\d{2}/
	for (const v of values) {
		if (v === '') continue
		if (allNumber && isNaN(Number(v))) allNumber = false
		if (allDate && !dateRe.test(v.trim())) allDate = false
	}
	if (allDate && values.some((v) => dateTimeRe.test(v.trim()))) return 'datetime'
	if (allDate) return 'date'
	if (allNumber) return 'number'
	return 'string'
}

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get('content-type') ?? ''
	let raw = ''
	if (contentType.includes('application/json')) {
		const body = await request.json().catch(() => ({}))
		raw =
			typeof body.csv === 'string' ? body.csv : typeof body.data === 'string' ? body.data : ''
	} else if (contentType.includes('multipart/form-data')) {
		const form = await request.formData()
		let file: File | null = null
		for (const [, v] of form.entries())
			if (v instanceof File) {
				file = v
				break
			}
		raw = file ? decodeCsvBytes(await file.arrayBuffer()) : ''
	} else if (contentType.includes('text/csv')) {
		// Read raw bytes so we can decode Windows-1252 / Latin-1 (e.g. Excel exports)
		raw = decodeCsvBytes(await request.arrayBuffer())
	}
	// Strip UTF-8 BOM so the first column name isn't "\uFEFFColumn"
	if (raw.length > 0 && raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
	if (!raw.trim()) return json({ error: 'No CSV data' }, { status: 400 })

	const filename = request.headers.get('X-CSV-Filename')?.trim()
	const sheetName =
		filename && filename.length > 0 ? filename.replace(/\.csv$/i, '').trim() || null : null

	const parsed = Papa.parse<string[]>(raw, { skipEmptyLines: true })
	const dataRows = parsed.data as string[][]
	if (!dataRows.length) return json({ error: 'Empty CSV' }, { status: 400 })

	const headers = dataRows[0]
	const sheetId = nanoid()

	try {
		await db.insert(sheets).values({ id: sheetId, name: sheetName })
		const columnIds: string[] = []
		for (let i = 0; i < headers.length; i++) {
			const name = (headers[i] ?? `Column ${i + 1}`).trim() || `Column ${i + 1}`
			const colId = nanoid()
			const sampleValues = dataRows.slice(1, 6).map((row) => String(row[i] ?? '').trim())
			const type = inferType(sampleValues)
			await db.insert(columns).values({
				id: colId,
				sheetId,
				name,
				type,
				order: i,
			})
			columnIds.push(colId)
		}
		for (let r = 1; r < dataRows.length; r++) {
			const rowId = nanoid()
			await db.insert(rows).values({ id: rowId, sheetId, orderNum: r - 1 })
			const cellValues = dataRows[r] ?? []
			await db.insert(cells).values(
				columnIds.map((colId, i) => ({
					rowId,
					columnId: colId,
					value: String(cellValues[i] ?? '').trim(),
				}))
			)
		}
	} catch (e) {
		const cause =
			e && typeof e === 'object' && 'cause' in e ? (e as { cause?: Error }).cause : e
		const msg = cause instanceof Error ? cause.message : String(cause)
		console.error('[import-csv] DB error:', msg)
		return json({ error: 'Database error', detail: msg }, { status: 500 })
	}
	broadcast(sheetId)
	return json({ id: sheetId, name: sheetName }, { status: 201 })
}
