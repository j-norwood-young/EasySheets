import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { rows, cells, columns } from '$lib/server/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { resolvePermission, allows } from '$lib/server/permissions';
import { getToken } from '$lib/server/api-utils';
import { broadcast } from '$lib/server/sse/channel';
import { nanoid } from 'nanoid';

export const GET: RequestHandler = async ({ params, request, url }) => {
	const sheetId = params.sheetId;
	const token = getToken(request);
	const { permission, ok } = await resolvePermission(sheetId, token);
	if (!ok) return json({ error: 'Forbidden' }, { status: 403 });

	const sortColumnId = url.searchParams.get('sortColumnId') ?? '';
	const sortDirection = (url.searchParams.get('sortDirection') ?? 'asc') as 'asc' | 'desc';
	// Filters: filter_<columnId>=<op>:<value> e.g. filter_col1=gt:10 or filter_col2=contains:foo
	const filterParams: Record<string, string> = {};
	url.searchParams.forEach((v, k) => {
		if (k.startsWith('filter_')) filterParams[k.slice(7)] = v;
	});

	const rowsList = await db
		.select()
		.from(rows)
		.where(eq(rows.sheetId, sheetId))
		.orderBy(rows.orderNum, rows.createdAt);

	// Load all cells for these rows
	const rowIds = rowsList.map((r) => r.id);
	if (rowIds.length === 0) {
		return json({ rows: [], cells: [] });
	}

	const cellsList = rowIds.length
		? await db.select().from(cells).where(inArray(cells.rowId, rowIds))
		: [];
	const cols = await db.select().from(columns).where(eq(columns.sheetId, sheetId)).orderBy(columns.order);

	const cellMap = new Map<string, string>();
	for (const c of cellsList) cellMap.set(`${c.rowId}:${c.columnId}`, c.value);

	// Apply filters (server-side)
	let filteredRows = rowsList;
	for (const [columnId, param] of Object.entries(filterParams)) {
		let [op, value] = param.includes(':') ? param.split(/:(.*)/s).map((s) => s.trim()) : ['eq', param];
		const caseSensitive = value.startsWith('case:');
		if (caseSensitive) value = value.slice(5);
		filteredRows = filteredRows.filter((row) => {
			const val = cellMap.get(`${row.id}:${columnId}`) ?? '';
			if (op === 'gt') return Number(val) > Number(value);
			if (op === 'lt') return Number(val) < Number(value);
			if (op === 'eq') return String(val) === String(value);
			if (op === 'startsWith') return caseSensitive ? String(val).startsWith(value) : String(val).toLowerCase().startsWith(String(value).toLowerCase());
			if (op === 'endsWith') return caseSensitive ? String(val).endsWith(value) : String(val).toLowerCase().endsWith(String(value).toLowerCase());
			if (op === 'contains') return caseSensitive ? String(val).includes(value) : String(val).toLowerCase().includes(String(value).toLowerCase());
			if (op === 'dateFrom') return (val || '') >= value;
			if (op === 'dateTo') return (val || '') <= value;
			return true;
		});
	}

	// Sort (type-aware: number/currency numeric, date/datetime by date, else string)
	const sortCol = cols.find((c) => c.id === sortColumnId);
	if (sortColumnId && sortCol) {
		const colType = sortCol.type;
		const numericTypes = ['number', 'currency'];
		const dateTypes = ['date', 'datetime'];
		filteredRows = [...filteredRows].sort((a, b) => {
			const va = cellMap.get(`${a.id}:${sortColumnId}`) ?? '';
			const vb = cellMap.get(`${b.id}:${sortColumnId}`) ?? '';
			let cmp: number;
			if (numericTypes.includes(colType)) {
				const na = Number(va);
				const nb = Number(vb);
				const numA = Number.isNaN(na) ? -Infinity : na;
				const numB = Number.isNaN(nb) ? -Infinity : nb;
				cmp = numA - numB;
			} else if (dateTypes.includes(colType)) {
				const da = va ? new Date(va).getTime() : -Infinity;
				const db = vb ? new Date(vb).getTime() : -Infinity;
				cmp = Number.isNaN(da) ? -1 : Number.isNaN(db) ? 1 : da - db;
			} else if (colType === 'boolean') {
				const ba = /^(1|true|yes)$/i.test(va.trim());
				const bb = /^(1|true|yes)$/i.test(vb.trim());
				cmp = (ba ? 1 : 0) - (bb ? 1 : 0);
			} else {
				cmp = va === vb ? 0 : va < vb ? -1 : 1;
			}
			return sortDirection === 'desc' ? -cmp : cmp;
		});
	} else {
		filteredRows = [...filteredRows].sort((a, b) => {
			const oA = a.orderNum;
			const oB = b.orderNum;
			if (oA !== oB) return oA - oB;
			const tA = a.createdAt?.getTime() ?? 0;
			const tB = b.createdAt?.getTime() ?? 0;
			return tA - tB;
		});
	}

	const cellsForRows = cellsList.filter((c) => filteredRows.some((r) => r.id === c.rowId));
	return json({
		rows: filteredRows.map((r) => ({ id: r.id, sheetId: r.sheetId, createdAt: r.createdAt, orderNum: r.orderNum })),
		cells: cellsForRows.map((c) => ({ rowId: c.rowId, columnId: c.columnId, value: c.value }))
	});
};

export const POST: RequestHandler = async ({ params, request }) => {
	const sheetId = params.sheetId;
	const token = getToken(request);
	const { permission, ok } = await resolvePermission(sheetId, token);
	if (!ok || !allows(permission, 'append')) return json({ error: 'Forbidden' }, { status: 403 });

	const body = await request.json().catch(() => ({}));
	const cellsPayload = (body.cells as Record<string, string>) ?? {};
	const rowId = nanoid();
	const createdByToken = token && allows(permission, 'append') ? token : null;

	const existing = await db
		.select({ orderNum: rows.orderNum })
		.from(rows)
		.where(eq(rows.sheetId, sheetId));
	const orderNum = existing.length === 0 ? 0 : Math.max(...existing.map((r) => r.orderNum)) + 1;

	await db.insert(rows).values({ id: rowId, sheetId, createdByToken, orderNum });

	const cols = await db.select().from(columns).where(eq(columns.sheetId, sheetId));
	const toInsert = cols.map((col) => ({
		rowId,
		columnId: col.id,
		value: String(cellsPayload[col.id] ?? '')
	}));
	if (toInsert.length) await db.insert(cells).values(toInsert);
	broadcast(sheetId);
	return json({ id: rowId }, { status: 201 });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const sheetId = params.sheetId;
	const token = getToken(request);
	const { permission, ok } = await resolvePermission(sheetId, token);
	if (!ok || !allows(permission, 'edit')) return json({ error: 'Forbidden' }, { status: 403 });

	const body = await request.json().catch(() => ({}));
	const order = body.order as string[] | undefined;
	if (!Array.isArray(order) || order.length === 0) return json({ error: 'Bad request: order array required' }, { status: 400 });

	// Verify all row IDs belong to this sheet
	const sheetRows = await db.select({ id: rows.id }).from(rows).where(eq(rows.sheetId, sheetId));
	const sheetRowIds = new Set(sheetRows.map((r) => r.id));
	for (const id of order) {
		if (!sheetRowIds.has(id)) return json({ error: 'Invalid row id' }, { status: 400 });
	}

	for (let i = 0; i < order.length; i++) {
		await db.update(rows).set({ orderNum: i }).where(and(eq(rows.id, order[i]), eq(rows.sheetId, sheetId)));
	}
	broadcast(sheetId);
	return json({ ok: true });
};
