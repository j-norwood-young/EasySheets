import { createHash } from 'crypto'

const SECRET_KEY = process.env.SECRET_KEY ?? ''

interface AppendedRows {
	[rowId: string]: string
}

export function createShareTokens(
	sheetId: string,
	permission: 'edit' | 'append',
	appendedRows: AppendedRows
): { tokenWithoutSecret: string; tokenWithSecret: string } {
	if (!SECRET_KEY) {
		throw new Error('SECRET_KEY is not defined in environment variables')
	}

	let base = `${permission}`
	if (permission === 'append') {
		const appendedRowsStr = JSON.stringify(appendedRows)
		base += `::${appendedRowsStr}`
	}

	const tokenWithoutSecret = `${sheetId}::${base}`

	const hashedData = createHash('sha256')
		.update(`${tokenWithoutSecret}::${SECRET_KEY}`)
		.digest('hex')
	const tokenWithSecret = `${sheetId}::${hashedData}`

	return { tokenWithoutSecret, tokenWithSecret }
}

export function verifyShareTokens(
	tokenWithoutSecret: string,
	tokenWithSecret: string
): {
	valid: boolean
	sheetId?: string
	permission?: 'edit' | 'append'
	appendedRows?: AppendedRows
} {
	const parts = tokenWithoutSecret.split('::')

	const sheetId = parts[0]
	const permission = parts[1] as 'edit' | 'append'

	if (permission !== 'edit' && permission !== 'append') {
		return { valid: false }
	}

	let appendedRows: AppendedRows | undefined
	if (permission === 'append' && parts.length > 2) {
		try {
			appendedRows = JSON.parse(parts[2])
		} catch {
			return { valid: false }
		}
	}

	const hashedData = createHash('sha256')
		.update(`${tokenWithoutSecret}::${SECRET_KEY}`)
		.digest('hex')
	const expectedTokenWithSecret = `${sheetId}::${hashedData}`

	if (tokenWithSecret !== expectedTokenWithSecret) {
		return { valid: false }
	}

	return { valid: true, sheetId, permission, appendedRows }
}
