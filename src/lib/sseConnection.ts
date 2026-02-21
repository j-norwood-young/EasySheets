/**
 * Client-only SSE connection helper. Tracks connection state and supports
 * reconnection (EventSource auto-reconnects; we only reflect open/error).
 */

export interface SheetStreamCallbacks {
	/** Called when connection opens or closes. */
	onConnectedChange: (connected: boolean) => void;
	/** Called when a message is received (e.g. sheet update). */
	onMessage?: () => void;
}

/**
 * Opens an EventSource to the sheet stream URL and reports connection state.
 * EventSource auto-reconnects on error; we set connected=false on error and true on open.
 * @param streamUrl - Full URL for the SSE stream (e.g. /api/sheets/:id/stream)
 * @param callbacks - onConnectedChange(connected), optional onMessage
 * @returns Cleanup function to close the connection
 */
export function createSheetStreamConnection(
	streamUrl: string,
	callbacks: SheetStreamCallbacks
): () => void {
	const es = new EventSource(streamUrl);

	es.onopen = () => {
		callbacks.onConnectedChange(true);
	};

	es.onerror = () => {
		// EventSource sets readyState to CONNECTING on error and will retry
		callbacks.onConnectedChange(false);
	};

	es.onmessage = () => {
		callbacks.onMessage?.();
	};

	return () => {
		es.close();
	};
}
