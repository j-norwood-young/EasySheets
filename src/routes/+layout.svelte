<script lang="ts">
	import './layout.css'
	import favicon from '$lib/assets/Building.svg'

	let { children } = $props()
</script>

<svelte:head>
	<title>SovereignOffice EasySheets</title>
	<link rel="icon" href={favicon} />
</svelte:head>
{@render children()}
