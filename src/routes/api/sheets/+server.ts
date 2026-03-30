import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { db } from '$lib/server/db'
import { sheets } from '$lib/server/db/schema'
import { nanoid } from 'nanoid'

export const POST: RequestHandler = async () => {
	const id = nanoid()
	await db.insert(sheets).values({
		id,
		name: null,
	})
	return json({ id }, { status: 201 })
}
