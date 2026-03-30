const STORAGE_KEY = 'easysheets-admin-sheets'

export type StoredSheet = {
	id: string
	name: string | null
	lastEdited: number
}

function read(): StoredSheet[] {
	if (typeof window === 'undefined') return []
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) return []
		return parsed.filter(
			(item): item is StoredSheet =>
				item != null &&
				typeof item === 'object' &&
				typeof (item as StoredSheet).id === 'string' &&
				typeof (item as StoredSheet).lastEdited === 'number'
		)
	} catch {
		return []
	}
}

function write(items: StoredSheet[]) {
	if (typeof window === 'undefined') return
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
	} catch {
		// quota or disabled
	}
}

/** Add or update a sheet and set lastEdited to now. Returns list sorted by lastEdited desc. */
export function addOrUpdateSheet(id: string, name?: string | null): StoredSheet[] {
	const list = read()
	const now = Date.now()
	const existing = list.find((s) => s.id === id)
	const entry: StoredSheet = {
		id,
		name: name ?? existing?.name ?? null,
		lastEdited: now,
	}
	const rest = list.filter((s) => s.id !== id)
	const next = [entry, ...rest].sort((a, b) => b.lastEdited - a.lastEdited)
	write(next)
	return next
}

/** Get sheets ordered by last edited (newest first). */
export function getSheets(): StoredSheet[] {
	const list = read()
	return [...list].sort((a, b) => b.lastEdited - a.lastEdited)
}
