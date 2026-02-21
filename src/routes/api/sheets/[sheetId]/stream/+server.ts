import type { RequestHandler } from './$types';
import { resolvePermission } from '$lib/server/permissions';
import { getToken } from '$lib/server/api-utils';
import { subscribe } from '$lib/server/sse/channel';

export const GET: RequestHandler = async ({ params, request }) => {
	const sheetId = params.sheetId;
	const token = getToken(request);
	const { ok } = await resolvePermission(sheetId, token);
	if (!ok) return new Response('Forbidden', { status: 403 });

	const stream = subscribe(sheetId);
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
