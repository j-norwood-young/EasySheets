import { db } from '$lib/server/db'
import { shareLinks } from '$lib/server/db/schema'
import { eq, and } from 'drizzle-orm'
import type { Permission } from '$lib/server/db/schema'

/** Resolve permission for a request. Editor = no token, full access. Shared = token gives read|append|edit (edit includes delete). */
export async function resolvePermission(
	sheetId: string,
	token: string | null
): Promise<{ permission: Permission | null; ok: boolean }> {
	if (!token) {
		// No token = editor (full access). We don't verify sheet exists here; API does.
		return { permission: 'edit', ok: true }
	}
	const [link] = await db
		.select()
		.from(shareLinks)
		.where(and(eq(shareLinks.token, token), eq(shareLinks.sheetId, sheetId)))
		.limit(1)
	if (!link) return { permission: null, ok: false }
	// Legacy: DB may have 'delete' stored; treat as 'edit'
	const raw = link.permission as string
	const permission: Permission = raw === 'delete' ? 'edit' : (raw as Permission)
	return { permission, ok: true }
}

/** Check if resolved permission allows at least the required level. */
export function allows(has: Permission | null, required: Permission): boolean {
	if (!has) return false
	const hierarchy: Permission[] = ['read', 'append', 'edit']
	return hierarchy.indexOf(has) >= hierarchy.indexOf(required)
}
