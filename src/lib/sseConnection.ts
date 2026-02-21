/**
 * Client-only SSE connection helper. Tracks connection state and supports
 * reconnection: we react immediately to the browser's offline/online events,
 * and force a fresh SSE connection when coming back online.
 */

export interface SheetStreamCallbacks {
	/** Called when connection opens or closes. */
	onConnectedChange: (connected: boolean) => void;
	/** Called when a message is received (e.g. sheet update). */
	onMessage?: () => void;
}

/**
 * Opens an EventSource to the sheet stream URL and reports connection state.
 * Uses the browser's offline/online events for immediate detection; when back
 * online we close and reopen the EventSource so we don't rely on retry backoff.
 * @param streamUrl - Full URL for the SSE stream (e.g. /api/sheets/:id/stream)
 * @param callbacks - onConnectedChange(connected), optional onMessage
 * @returns Cleanup function to close the connection
 */
export function createSheetStreamConnection(
	streamUrl: string,
	callbacks: SheetStreamCallbacks
): () => void {
	function openConnection(): EventSource {
		const es = new EventSource(streamUrl);
		es.onopen = () => callbacks.onConnectedChange(true);
		es.onerror = () => {
			// EventSource sets readyState to CONNECTING and will retry
			callbacks.onConnectedChange(false);
		};
		es.onmessage = () => callbacks.onMessage?.();
		return es;
	}

	let es = openConnection();

	// Reflect browser offline state immediately (don't wait for EventSource to fail)
	if (typeof window !== 'undefined') {
		if (!navigator.onLine) {
			callbacks.onConnectedChange(false);
		}
		window.addEventListener('offline', handleOffline);
		window.addEventListener('online', handleOnline);
	}

	function handleOffline(): void {
		callbacks.onConnectedChange(false);
	}

	function handleOnline(): void {
		if (typeof window === 'undefined') return;
		// Show online immediately when the browser says we're back (don't wait for SSE)
		callbacks.onConnectedChange(true);
		// Reopen EventSource so we don't wait on backoff; onerror will set false if server is unreachable
		if (es.readyState !== EventSource.OPEN) {
			es.close();
			es = openConnection();
		}
	}

	return () => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('offline', handleOffline);
			window.removeEventListener('online', handleOnline);
		}
		es.close();
	};
}
