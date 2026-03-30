import type { Handle } from '@sveltejs/kit'

/**
 * Ensures JSON and SSE responses explicitly declare charset=utf-8 so Unicode
 * (e.g. emoji, accented characters) is interpreted correctly by all clients.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event)
	const ct = response.headers.get('Content-Type')
	if (!ct) return response
	const needCharset =
		(ct.startsWith('application/json') || ct.startsWith('text/event-stream')) &&
		!ct.includes('charset=')
	if (!needCharset) return response
	const newHeaders = new Headers(response.headers)
	newHeaders.set('Content-Type', ct.trimEnd() + '; charset=utf-8')
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	})
}
