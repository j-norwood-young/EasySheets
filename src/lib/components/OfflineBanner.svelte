<script lang="ts">
	let { connected = true, pendingCount = 0 }: { connected?: boolean; pendingCount?: number } = $props();
	const showBanner = $derived(!connected);
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
				d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a5 5 0 01-7.072 0"
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
