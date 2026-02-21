import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sheets, columns, rows, cells } from '$lib/server/db/schema';
import { nanoid } from 'nanoid';
import type { ColumnType } from '$lib/server/db/schema';
import Papa from 'papaparse';
import { broadcast } from '$lib/server/sse/channel';

function inferType(values: string[]): ColumnType {
	let allNumber = true;
	let allDate = true;
	const dateRe = /^\d{4}-\d{2}-\d{2}/;
	const dateTimeRe = /^\d{4}-\d{2}-\d{2}T|\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;
	for (const v of values) {
		if (v === '') continue;
		if (allNumber && isNaN(Number(v))) allNumber = false;
		if (allDate && !dateRe.test(v.trim())) allDate = false;
	}
	if (allDate && values.some((v) => dateTimeRe.test(v.trim()))) return 'datetime';
	if (allDate) return 'date';
	if (allNumber) return 'number';
	return 'string';
}

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get('content-type') ?? '';
	let raw = '';
	if (contentType.includes('application/json')) {
		const body = await request.json().catch(() => ({}));
		raw = typeof body.csv === 'string' ? body.csv : typeof body.data === 'string' ? body.data : '';
	} else if (contentType.includes('text/csv') || contentType.includes('multipart/form-data')) {
		raw = await request.text();
	}
	if (!raw.trim()) return json({ error: 'No CSV data' }, { status: 400 });

	const filename = request.headers.get('X-CSV-Filename')?.trim();
	const sheetName =
		filename && filename.length > 0
			? filename.replace(/\.csv$/i, '').trim() || null
			: null;

	const parsed = Papa.parse<string[]>(raw, { skipEmptyLines: true });
	const dataRows = parsed.data as string[][];
	if (!dataRows.length) return json({ error: 'Empty CSV' }, { status: 400 });

	const headers = dataRows[0];
	const sheetId = nanoid();
	await db.insert(sheets).values({ id: sheetId, name: sheetName });

	const columnIds: string[] = [];
	for (let i = 0; i < headers.length; i++) {
		const name = (headers[i] ?? `Column ${i + 1}`).trim() || `Column ${i + 1}`;
		const colId = nanoid();
		const sampleValues = dataRows.slice(1, 6).map((row) => String(row[i] ?? '').trim());
		const type = inferType(sampleValues);
		await db.insert(columns).values({
			id: colId,
			sheetId,
			name,
			type,
			order: i
		});
		columnIds.push(colId);
	}

	for (let r = 1; r < dataRows.length; r++) {
		const rowId = nanoid();
		await db.insert(rows).values({ id: rowId, sheetId, orderNum: r - 1 });
		const cellValues = dataRows[r] ?? [];
		await db.insert(cells).values(
			columnIds.map((colId, i) => ({
				rowId,
				columnId: colId,
				value: String(cellValues[i] ?? '').trim()
			}))
		);
	}
	broadcast(sheetId);
	return json({ id: sheetId, name: sheetName }, { status: 201 });
};
