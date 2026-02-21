import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { shareLinks } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getToken } from '$lib/server/api-utils';
import { resolvePermission, allows } from '$lib/server/permissions';
import { nanoid } from 'nanoid';
import { permissions } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ params, request }) => {
	const sheetId = params.sheetId;
	const token = getToken(request);
	const { permission, ok } = await resolvePermission(sheetId, token);
	if (!ok || !allows(permission, 'read')) return json({ error: 'Forbidden' }, { status: 403 });

	let links = await db.select().from(shareLinks).where(eq(shareLinks.sheetId, sheetId));

	// Remove legacy 'delete' links (we now only have read, append, edit)
	const legacyDelete = links.filter((l) => (l.permission as string) === 'delete');
	for (const link of legacyDelete) {
		await db.delete(shareLinks).where(eq(shareLinks.id, link.id));
	}
	if (legacyDelete.length > 0) {
		links = await db.select().from(shareLinks).where(eq(shareLinks.sheetId, sheetId));
	}

	// Ensure we have exactly 3 links (one per permission: read, append, edit)
	if (links.length < 3) {
		const existing = new Set(links.map((l) => l.permission));
		for (const perm of permissions) {
			if (existing.has(perm)) continue;
			const id = nanoid();
			const tokenVal = nanoid(21);
			await db.insert(shareLinks).values({
				id,
				sheetId,
				token: tokenVal,
				permission: perm
			});
			links.push({
				id,
				sheetId,
				token: tokenVal,
				permission: perm
			});
		}
		links = await db.select().from(shareLinks).where(eq(shareLinks.sheetId, sheetId));
	}

	// Return one link per permission (normalize any remaining legacy 'delete' as 'edit')
	const byPermission = new Map<string, { permission: string; token: string }>();
	for (const l of links) {
		const perm = (l.permission as string) === 'delete' ? 'edit' : l.permission;
		if (!byPermission.has(perm)) byPermission.set(perm, { permission: perm, token: l.token });
	}
	return json({
		links: permissions.map((p) => byPermission.get(p)).filter(Boolean) as { permission: string; token: string }[]
	});
};
