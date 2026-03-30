<script lang="ts">
	let { connected = true, pendingCount = 0 }: { connected?: boolean; pendingCount?: number } =
		$props()
	const showBanner = $derived(!connected)
</script>

{#if showBanner}
	<div
		class="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
		role="status"
		aria-live="polite"
	>
		<svg
			class="h-4 w-4 shrink-0 text-amber-600"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
			/>
		</svg>
		<span>
			Offline — editing is disabled. New rows will sync when you're back online.
			{#if pendingCount > 0}
				<strong>{pendingCount} row{pendingCount === 1 ? '' : 's'} pending.</strong>
			{/if}
		</span>
	</div>
{/if}
