import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { rows } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { resolvePermission, allows } from '$lib/server/permissions';
import { getToken } from '$lib/server/api-utils';
import { broadcast } from '$lib/server/sse/channel';

export const DELETE: RequestHandler = async ({ params, request }) => {
	const { sheetId, rowId } = params;
	const token = getToken(request);
	const { permission, ok } = await resolvePermission(sheetId, token);
	if (!ok) return json({ error: 'Forbidden' }, { status: 403 });

	const [row] = await db
		.select()
		.from(rows)
		.where(and(eq(rows.id, rowId), eq(rows.sheetId, sheetId)))
		.limit(1);
	if (!row) return json({ error: 'Not found' }, { status: 404 });

	const canDeleteAny = allows(permission, 'edit');
	const canDeleteOwnAppend = permission === 'append' && token && row.createdByToken === token;
	if (!canDeleteAny && !canDeleteOwnAppend) return json({ error: 'Forbidden' }, { status: 403 });

	await db.delete(rows).where(eq(rows.id, rowId));
	broadcast(sheetId);
	return json({ ok: true });
};
