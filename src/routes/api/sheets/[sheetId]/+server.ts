import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sheets, columns } from '$lib/server/db/schema';
import { parseColumnFormat } from '$lib/server/column-format';
import { eq } from 'drizzle-orm';
import { resolvePermission, allows } from '$lib/server/permissions';
import { getToken } from '$lib/server/api-utils';

export const GET: RequestHandler = async ({ params, request }) => {
	const sheetId = params.sheetId;
	const token = getToken(request);
	const { permission, ok } = await resolvePermission(sheetId, token);
	if (!ok) return json({ error: 'Forbidden' }, { status: 403 });

	const [sheet] = await db.select().from(sheets).where(eq(sheets.id, sheetId)).limit(1);
	if (!sheet) return json({ error: 'Not found' }, { status: 404 });

	const cols = await db
		.select()
		.from(columns)
		.where(eq(columns.sheetId, sheetId))
		.orderBy(columns.order, columns.id);

	const columnsWithFormat = cols.map((c) => ({
		id: c.id,
		sheetId: c.sheetId,
		name: c.name,
		type: c.type,
		order: c.order,
		format: parseColumnFormat(c.format)
	}));

	return json({
		id: sheet.id,
		name: sheet.name,
		createdAt: sheet.createdAt,
		columns: columnsWithFormat,
		permission: permission ?? 'edit'
	});
}

export const PATCH: RequestHandler = async ({ params, request }) => {
	const sheetId = params.sheetId;
	const token = getToken(request);
	const { permission, ok } = await resolvePermission(sheetId, token);
	if (!ok || !allows(permission, 'edit')) return json({ error: 'Forbidden' }, { status: 403 });

	const body = await request.json().catch(() => ({}));
	const name = typeof body.name === 'string' ? body.name : undefined;
	if (name === undefined) return json({ error: 'No name' }, { status: 400 });

	await db.update(sheets).set({ name }).where(eq(sheets.id, sheetId));
	return json({ ok: true });
};

