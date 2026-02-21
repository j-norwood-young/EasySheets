/**
 * URL detection and display shortening for linkified text.
 */

const URL_REGEX =
	/https?:\/\/[^\s<>[\](){}'"]+|www\.[^\s<>[\](){}'"]+/gi;

export type Segment = { type: 'text'; value: string } | { type: 'url'; value: string };

/**
 * Splits a string into segments of plain text and URLs (for rendering as links).
 */
export function parseLinkifiedSegments(text: string): Segment[] {
	if (!text || typeof text !== 'string') return [{ type: 'text', value: text || '' }];
	const segments: Segment[] = [];
	let lastIndex = 0;
	const re = new RegExp(URL_REGEX.source, 'gi');
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		if (m.index > lastIndex) {
			segments.push({ type: 'text', value: text.slice(lastIndex, m.index) });
		}
		const raw = m[0];
		const trimmed = raw.replace(/[.,;:!?)]+$/, '');
		segments.push({ type: 'url', value: trimmed });
		lastIndex = m.index + raw.length;
	}
	if (lastIndex < text.length) {
		segments.push({ type: 'text', value: text.slice(lastIndex) });
	}
	return segments.length ? segments : [{ type: 'text', value: text }];
}

const ELLIPSIS = '…';
const TRUNCATE_END_LENGTH = 4;

/**
 * Shortens a URL for display: if longer than maxLength, shows more of the start + "…" + last 4 chars.
 * @param url - The URL string
 * @param maxLength - Max display length (default 25). Must be at least start + ellipsis + end.
 */
export function shortenUrlDisplay(url: string, maxLength: number = 25): string {
	if (url.length <= maxLength) return url;
	const safeMax = Math.max(TRUNCATE_END_LENGTH + ELLIPSIS.length + 1, maxLength);
	const startLen = safeMax - ELLIPSIS.length - TRUNCATE_END_LENGTH;
	const start = url.slice(0, startLen);
	const end = url.slice(-TRUNCATE_END_LENGTH);
	return `${start}${ELLIPSIS}${end}`;
}
