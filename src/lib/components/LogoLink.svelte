<script lang="ts">
	import Logo from '$lib/assets/Building.svg'

	let {
		class: className = 'h-8 w-8',
		openInNewTab = true,
	}: { class?: string; openInNewTab?: boolean } = $props()
</script>

<a
	href="/"
	{...openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}}
	class="shrink-0 rounded focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2 focus:outline-none"
	aria-label={openInNewTab ? 'SovereignOffice EasySheets (opens in new tab)' : 'Go to home'}
>
	<img src={Logo} alt="" class={className} />
</a>
