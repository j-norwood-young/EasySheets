import type { ColumnFormat } from '$lib/server/db/schema'

export function parseColumnFormat(raw: string | null): ColumnFormat | null {
	if (raw == null || raw === '') return null
	try {
		const o = JSON.parse(raw) as unknown
		if (typeof o !== 'object' || o === null) return null
		const f: ColumnFormat = {}
		if (typeof (o as Record<string, unknown>).currencySymbol === 'string')
			f.currencySymbol = (o as Record<string, unknown>).currencySymbol as string
		if (typeof (o as Record<string, unknown>).decimalPlaces === 'number')
			f.decimalPlaces = (o as Record<string, unknown>).decimalPlaces as number
		if (typeof (o as Record<string, unknown>).thousandsSeparator === 'boolean')
			f.thousandsSeparator = (o as Record<string, unknown>).thousandsSeparator as boolean
		return Object.keys(f).length ? f : null
	} catch {
		return null
	}
}
