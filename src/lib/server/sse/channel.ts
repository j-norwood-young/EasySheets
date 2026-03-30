type Controller = ReadableStreamDefaultController<Uint8Array>

const channels = new Map<string, Set<Controller>>()

function encode(message: string): Uint8Array {
	return new TextEncoder().encode(`data: ${message}\n\n`)
}

export function subscribe(sheetId: string): ReadableStream<Uint8Array> {
	let set = channels.get(sheetId)
	if (!set) {
		set = new Set()
		channels.set(sheetId, set)
	}
	const ref: { controller: Controller | null } = { controller: null }
	return new ReadableStream<Uint8Array>({
		start(controller) {
			ref.controller = controller
			set!.add(controller)
		},
		cancel() {
			if (ref.controller) set?.delete(ref.controller)
			if (set?.size === 0) channels.delete(sheetId)
		},
	})
}

export function broadcast(sheetId: string): void {
	const set = channels.get(sheetId)
	if (!set) return
	const payload = JSON.stringify({ type: 'sheet-update' })
	const data = encode(payload)
	for (const c of set) {
		try {
			c.enqueue(data)
		} catch {
			set.delete(c)
		}
	}
	if (set.size === 0) channels.delete(sheetId)
}
