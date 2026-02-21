import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { shareLinks, sheets, columns } from '$lib/server/db/schema';
import { parseColumnFormat } from '$lib/server/column-format';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, url }) => {
	const token = params.token;
	const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
	if (!link) throw error(404, 'Share link not found');

	const [sheet] = await db.select().from(sheets).where(eq(sheets.id, link.sheetId)).limit(1);
	if (!sheet) throw error(404, 'Sheet not found');

	const cols = await db
		.select()
		.from(columns)
		.where(eq(columns.sheetId, link.sheetId))
		.orderBy(columns.order, columns.id);

	const columnsWithFormat = cols.map((c) => ({
		id: c.id,
		sheetId: c.sheetId,
		name: c.name,
		type: c.type,
		order: c.order,
		format: parseColumnFormat(c.format)
	}));

	const sort = url.searchParams.get('sort') ?? '';
	const dir = (url.searchParams.get('dir') ?? 'asc') as 'asc' | 'desc';
	const filters: Record<string, string> = {};
	url.searchParams.forEach((v, k) => {
		if (k.startsWith('filter_')) filters[k.slice(7)] = v;
	});

	return {
		sheetId: sheet.id,
		name: sheet.name,
		permission: link.permission,
		columns: columnsWithFormat,
		token,
		sort,
		dir,
		filters
	};
};
