<script lang="ts">
	import { getSheets, addOrUpdateSheet } from '$lib/adminSheetsStorage';
	import { onMount } from 'svelte';
	import LogoLink from '$lib/components/LogoLink.svelte';
	import PermissionIcon from '$lib/components/PermissionIcon.svelte';

	let creating = $state(false);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	let fileInput: HTMLInputElement;
	let mySheets = $state<{ id: string; name: string | null; lastEdited: number }[]>([]);

	let shareSheetId = $state<string | null>(null);
	let shareSheetName = $state<string | null>(null);
	let shareLinks = $state<{ permission: string; token: string }[]>([]);
	let copied = $state<string | null>(null);
	let shareError = $state<string | null>(null);

	onMount(() => {
		mySheets = getSheets();
	});

	async function createBlank() {
		creating = true;
		error = null;
		try {
			const res = await fetch('/api/sheets', { method: 'POST' });
			if (!res.ok) throw new Error('Failed to create sheet');
			const { id } = await res.json();
			addOrUpdateSheet(id);
			window.location.href = `/sheets/${id}?addColumn=1`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong';
		} finally {
			creating = false;
		}
	}

	async function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		uploading = true;
		error = null;
		try {
			const res = await fetch('/api/sheets/import-csv', {
				method: 'POST',
				headers: {
					'Content-Type': 'text/csv',
					'X-CSV-Filename': file.name
				},
				body: await file.text()
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error ?? 'Import failed');
			}
			const { id, name } = await res.json();
			addOrUpdateSheet(id, name ?? undefined);
			window.location.href = `/sheets/${id}`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong';
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	async function openShare(sheet: { id: string; name: string | null }) {
		shareSheetId = sheet.id;
		shareSheetName = sheet.name ?? 'Untitled sheet';
		shareError = null;
		shareLinks = [];
		try {
			const res = await fetch(`/api/sheets/${sheet.id}/share-links`);
			if (!res.ok) throw new Error('Failed to load links');
			const json = await res.json();
			shareLinks = json.links ?? [];
		} catch (e) {
			shareError = e instanceof Error ? e.message : 'Failed';
		}
	}

	function copyLink(token: string) {
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		navigator.clipboard.writeText(`${origin}/s/${token}`);
		copied = token;
		setTimeout(() => (copied = null), 2000);
	}

	function copyAdminLink() {
		if (!shareSheetId) return;
		const origin = typeof window !== 'undefined' ? window.location.origin : '';
		navigator.clipboard.writeText(`${origin}/sheets/${shareSheetId}`);
		copied = 'admin';
		setTimeout(() => (copied = null), 2000);
	}
</script>

<div class="min-h-screen bg-zinc-50 text-zinc-900">
	<header class="border-b border-zinc-200 bg-white/80 backdrop-blur">
		<div class="mx-auto max-w-4xl px-4 py-4 flex items-center gap-3">
			<LogoLink />
			<h1 class="text-xl font-semibold tracking-tight text-zinc-800">SovereignOffice EasySheets</h1>
		</div>
	</header>
	<main class="mx-auto max-w-2xl px-4 py-16">
		<div class="text-center">
			<h2 class="text-2xl font-medium text-zinc-800 sm:text-3xl">Create a new sheet</h2>
			<p class="mt-2 text-zinc-500">Start from scratch or upload a CSV file.</p>
		</div>
		<div class="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
			<button
				type="button"
				disabled={creating}
				onclick={createBlank}
				class="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
			>
				{creating ? 'Creating…' : 'Create blank sheet'}
			</button>
			<label
				class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50"
			>
				<input
					type="file"
					accept=".csv"
					class="sr-only"
					disabled={uploading}
					onchange={onFileChange}
					bind:this={fileInput}
				/>
				{uploading ? 'Uploading…' : 'Upload CSV'}
			</label>
		</div>
		{#if error}
			<p class="mt-4 text-center text-sm text-red-600" role="alert">{error}</p>
		{/if}

		{#if mySheets.length > 0}
			<section class="mt-16 border-t border-zinc-200 pt-10" aria-labelledby="your-sheets-heading">
				<h2 id="your-sheets-heading" class="text-center text-lg font-medium text-zinc-800">Your sheets</h2>
				<p class="mt-1 text-center text-sm text-zinc-500">Sheets you've created or edited (by last opened)</p>
				<ul class="mt-4 space-y-2">
					{#each mySheets as sheet}
						<li
							class="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300"
						>
							<a
								href="/sheets/{sheet.id}"
								class="min-w-0 flex-1 px-4 py-3 text-left hover:bg-zinc-50"
							>
								<span class="font-medium text-zinc-800">{sheet.name || 'Untitled sheet'}</span>
								<span class="ml-2 text-sm text-zinc-500">/sheets/{sheet.id}</span>
							</a>
							<button
								type="button"
								onclick={(e) => {
									e.preventDefault();
									openShare(sheet);
								}}
								class="shrink-0 rounded px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-800"
								title="Share"
							>
								Share
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</main>

	{#if shareSheetId}
		<div
			class="fixed inset-0 z-10 flex items-center justify-center bg-black/30"
			role="dialog"
			aria-modal="true"
			aria-labelledby="share-modal-title"
			tabindex="-1"
			onclick={(e) => e.target === e.currentTarget && (shareSheetId = null)}
			onkeydown={(e) => e.key === 'Escape' && (shareSheetId = null)}
		>
			<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
				<h3 id="share-modal-title" class="text-lg font-medium text-zinc-900">
					Share: {shareSheetName}
				</h3>
				<p class="mt-1 text-sm text-zinc-500">Each link has different permissions.</p>
				{#if shareError}
					<p class="mt-4 text-sm text-red-600" role="alert">{shareError}</p>
				{:else}
					<ul class="mt-4 space-y-3">
						<li class="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/50 px-4 py-3">
							<span class="text-sm font-medium text-zinc-700">Admin</span>
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={copyAdminLink}
									class="rounded px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
								>
									{copied === 'admin' ? 'Copied!' : 'Copy link'}
								</button>
							</div>
						</li>
						{#each shareLinks as link}
							<li class="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/50 px-4 py-3">
								<span class="flex items-center gap-2">
									<PermissionIcon permission={link.permission as 'read' | 'append' | 'edit'} class="text-zinc-700" />
									<span class="text-sm font-medium capitalize text-zinc-700">{link.permission}</span>
								</span>
								<div class="flex items-center gap-2">
									<a
										href="/s/{link.token}"
										target="_blank"
										rel="noopener noreferrer"
										class="rounded px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
									>
										Open
									</a>
									<button
										type="button"
										onclick={() => copyLink(link.token)}
										class="rounded px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
									>
										{copied === link.token ? 'Copied!' : 'Copy link'}
									</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
				<div class="mt-4 flex justify-end">
					<button
						type="button"
						onclick={() => (shareSheetId = null)}
						class="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
					>
						Done
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
