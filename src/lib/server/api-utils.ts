/** Get share token from request: query param ?token= or header X-Share-Token */
export function getToken(request: Request): string | null {
	const url = new URL(request.url);
	const q = url.searchParams.get('token');
	if (q) return q;
	return request.headers.get('X-Share-Token');
}
