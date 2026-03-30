<script lang="ts">
	import type { Snippet } from 'svelte'

	let {
		open = false,
		title = '',
		/** Optional accessible description text shown under the title. */
		description = '',
		/** Called when the modal should close (backdrop click, Escape, or buttons). */
		onClose = undefined as (() => void) | undefined,
		/** Optional primary action; if omitted, no primary button is shown. */
		onPrimary = undefined as (() => void | Promise<void>) | undefined,
		primaryLabel = 'OK',
		primaryVariant = 'default' as 'default' | 'danger',
		/** Optional secondary action; when omitted but onClose is provided, secondary falls back to close. */
		onSecondary = undefined as (() => void | Promise<void>) | undefined,
		secondaryLabel = 'Cancel',
		/** When false, clicking the backdrop does not close the modal. */
		closeOnBackdrop = true,
		/** When false, pressing Escape does not close the modal. */
		closeOnEscape = true,
		children = undefined as Snippet | undefined,
	}: {
		open?: boolean
		title?: string
		description?: string
		onClose?: () => void
		onPrimary?: () => void | Promise<void>
		primaryLabel?: string
		primaryVariant?: 'default' | 'danger'
		onSecondary?: () => void | Promise<void>
		secondaryLabel?: string
		closeOnBackdrop?: boolean
		closeOnEscape?: boolean
		children?: Snippet
	} = $props()

	let busy = $state(false)

	async function handlePrimaryClick() {
		if (!onPrimary) return
		if (busy) return
		busy = true
		try {
			await onPrimary()
		} finally {
			busy = false
		}
	}

	async function handleSecondaryClick() {
		const fn = onSecondary ?? onClose
		if (!fn) return
		if (busy) return
		busy = true
		try {
			await fn()
		} finally {
			busy = false
		}
	}

	function requestClose() {
		if (busy) return
		onClose?.()
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
		role="dialog"
		aria-modal="true"
		aria-label={title}
		tabindex="-1"
		onclick={(event) => {
			if (!closeOnBackdrop) return
			if (event.target === event.currentTarget) requestClose()
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape' && closeOnEscape) {
				event.stopPropagation()
				event.preventDefault()
				requestClose()
			}
		}}
	>
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-lg ring-1 ring-black/5">
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					{#if title}
						<h3 class="text-lg font-medium text-zinc-900">{title}</h3>
					{/if}
					{#if description}
						<p class="mt-1 text-sm text-zinc-600">{description}</p>
					{/if}
				</div>
				{#if onClose}
					<button
						type="button"
						class="-m-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:outline-none"
						aria-label="Close"
						onclick={requestClose}
					>
						<span class="text-lg leading-none">&times;</span>
					</button>
				{/if}
			</div>

			{#if children}
				<div class="mt-4 text-sm text-zinc-700">
					{@render children()}
				</div>
			{/if}

			<div class="mt-6 flex justify-end gap-2">
				{#if onSecondary || onClose}
					<button
						type="button"
						onclick={handleSecondaryClick}
						disabled={busy}
						class="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{secondaryLabel}
					</button>
				{/if}
				{#if onPrimary}
					<button
						type="button"
						onclick={handlePrimaryClick}
						disabled={busy}
						class={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
							primaryVariant === 'danger'
								? 'bg-red-600 hover:bg-red-700'
								: 'bg-zinc-900 hover:bg-zinc-800'
						}`}
					>
						{busy ? 'Working…' : primaryLabel}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
