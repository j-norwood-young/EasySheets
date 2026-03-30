<script lang="ts">
	import { parseLinkifiedSegments, shortenUrlDisplay } from '$lib/linkify'

	let {
		text = '',
		maxLength = 25,
		class: className = '',
	} = $props<{
		text: string
		maxLength?: number
		class?: string
	}>()

	const segments = $derived(parseLinkifiedSegments(text))

	function hrefForUrl(url: string): string {
		if (/^https?:\/\//i.test(url)) return url
		return `https://${url}`
	}
</script>

<span class={className}>
	{#each segments as segment}
		{#if segment.type === 'text'}
			{segment.value}
		{:else}
			<a
				href={hrefForUrl(segment.value)}
				target="_blank"
				rel="noopener noreferrer"
				class="text-zinc-900 underline decoration-zinc-400 underline-offset-2 hover:decoration-zinc-600"
				title={segment.value}
			>
				{shortenUrlDisplay(segment.value, maxLength)}
			</a>
		{/if}
	{/each}
</span>
