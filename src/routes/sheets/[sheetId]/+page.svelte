<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import LogoLink from '$lib/components/LogoLink.svelte';
	import PermissionIcon from '$lib/components/PermissionIcon.svelte';
	import type { ColumnFormat } from '$lib/formatCell';
	import { createSheetStreamConnection } from '$lib/sseConnection';
	import { addOrUpdateSheet } from '$lib/adminSheetsStorage';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';

	type ColumnRow = {
		id: string;
		name: string;
		type: string;
		order?: number;
		sheetId?: string;
		format?: ColumnFormat | null;
	};

	type RowRow = { id: string; sheetId: string; createdAt: Date | null; orderNum?: number };

	function parseColumnFormat(format: string | ColumnFormat | null | undefined): ColumnFormat | null | undefined {
		if (format == null) return format;
		if (typeof format === 'string') {
			try {
				return JSON.parse(format) as ColumnFormat;
			} catch {
				return undefined;
			}
		}
		return format;
	}

	let { data } = $props();
	const sheetId = $derived(page.params.sheetId);

	let columns = $state<ColumnRow[]>([]);
	let rows = $state<RowRow[]>([]);
	let cells = $state<{ rowId: string; columnId: string; value: string }[]>([]);
	let loading = $state(false);
	let initialLoadDone = $state(false);

	$effect(() => {
		columns = (data.columns ?? []).map((col) => ({
			...col,
			format: parseColumnFormat(col.format as string | ColumnFormat | null)
		}));
		rows = data.rows ?? [];
		cells = data.cells ?? [];
	});

	// Record admin visit so the sheet appears in "Your sheets" on the landing page
	$effect(() => {
		if (typeof window === 'undefined' || !sheetId) return;
		const sheet = (data as { sheet?: { id: string; name?: string | null } }).sheet;
		addOrUpdateSheet(sheetId, sheet?.name);
	});
	let addColumnOpen = $state(false);
	/** When set, we're editing this column; otherwise adding new. */
	let editColumnId = $state<string | null>(null);
	let newColName = $state('');
	let newColType = $state<string>('string');
	let newColFormat = $state<ColumnFormat>({});
	let sheetName = $state('');
	let savingName = $state(false);
	$effect(() => {
		const sheet = (data as { sheet?: { name?: string | null } }).sheet;
		sheetName = sheet?.name ?? '';
	});
	let shareOpen = $state(false);
	let shareLinks = $state<{ permission: string; token: string }[]>([]);
	let copied = $state<string | null>(null);
	let error = $state<string | null>(null);
	/** When true, the column edit modal shows "Are you sure?" for remove column. */
	let confirmRemoveColumn = $state(false);

	/** SSE connection state; when false, editing is disabled and add-row is offline-only. */
	let connected = $state(true);
	/** Rows added while offline; synced when we reconnect. */
	let pendingOfflineRows = $state<{ tempId: string; cells: Record<string, string> }[]>([]);

	let isEditing = $state(false);
	let pendingRows = $state<RowRow[] | null>(null);
	let pendingCells = $state<{ rowId: string; columnId: string; value: string }[] | null>(null);
	/** Row IDs selected for bulk delete (admin view). */
	let selectedRowIds = $state<Set<string>>(new Set());

	function applyPending() {
		if (pendingRows != null && pendingCells != null) {
			rows = pendingRows;
			cells = pendingCells;
			pendingRows = null;
			pendingCells = null;
		}
	}
	function onEditingStart() { isEditing = true; }
	function onEditingEnd() {
		isEditing = false;
		applyPending();
	}

	const baseUrl = $derived(
		typeof window !== 'undefined' ? window.location.origin : ''
	);

	function buildRowsUrl() {
		return `/api/sheets/${sheetId}/rows`;
	}

	let fetchAbort: AbortController | null = null;

	async function fetchRows() {
		fetchAbort?.abort();
		fetchAbort = new AbortController();
		const { signal } = fetchAbort;
		const url = buildRowsUrl();
		try {
			const res = await fetch(url, { signal, cache: 'no-store' });
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || 'Failed to load rows');
			}
			const json = await res.json();
			const newRows = (json.rows ?? []) as RowRow[];
			const newCells = json.cells ?? [];
			if (isEditing) {
				pendingRows = newRows;
				pendingCells = newCells;
			} else {
				rows = newRows;
				cells = newCells;
			}
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			error = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	async function fetchSheet() {
		try {
			const res = await fetch(`/api/sheets/${sheetId}`, { cache: 'no-store' });
			if (res.ok) {
				const json = await res.json();
				columns = json.columns ?? [];
			}
		} catch {
			// non-critical background refresh
		}
	}

	async function syncPendingOfflineRows() {
		if (pendingOfflineRows.length === 0) return;
		const toSync = [...pendingOfflineRows];
		pendingOfflineRows = [];
		// Remove temp-id rows from local state so refetch replaces with server data
		rows = rows.filter((r) => !r.id.startsWith('offline-'));
		cells = cells.filter((c) => !c.rowId.startsWith('offline-'));
		for (let i = 0; i < toSync.length; i++) {
			const { cells: cellValues } = toSync[i];
			try {
				const res = await fetch(`/api/sheets/${sheetId}/rows`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ cells: cellValues })
				});
				if (!res.ok) throw new Error('Sync failed');
			} catch {
				// Re-queue remaining rows (including this one) for next reconnect
				pendingOfflineRows = toSync.slice(i);
				break;
			}
		}
		fetchRows();
		fetchSheet();
	}

	onMount(() => {
		if (!sheetId) return;
		initialLoadDone = true;

		// Open Add Column modal when arriving from "Create blank sheet" (?addColumn=1)
		const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
		if (params?.get('addColumn') === '1') {
			tick().then(() => {
				openAddColumn();
				const u = new URL(window.location.href);
				u.searchParams.delete('addColumn');
				const target = u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '');
				replaceState(target, {});
			});
		}

		let sseDebounce: ReturnType<typeof setTimeout> | null = null;
		let wasConnected = false;
		const cleanup = createSheetStreamConnection(
			typeof window !== 'undefined' ? `${window.location.origin}/api/sheets/${sheetId}/stream` : '',
			{
				onConnectedChange(nowConnected: boolean) {
					connected = nowConnected;
					if (nowConnected && wasConnected === false && pendingOfflineRows.length > 0) {
						syncPendingOfflineRows();
					}
					wasConnected = nowConnected;
				},
				onMessage() {
					if (sseDebounce) clearTimeout(sseDebounce);
					sseDebounce = setTimeout(() => {
						sseDebounce = null;
						fetchSheet();
						fetchRows();
					}, 500);
				}
			}
		);
		return () => {
			cleanup();
			if (sseDebounce) clearTimeout(sseDebounce);
			fetchAbort?.abort();
		};
	});

	$effect(() => {
		if (typeof window === 'undefined' || !initialLoadDone) return;
		sheetId;
		fetchRows();
	});

	function buildFormatPayload(): ColumnFormat | null {
		const isNumeric = newColType === 'number' || newColType === 'currency';
		const f: ColumnFormat = {};
		if (newColType === 'currency' && newColFormat.currencySymbol != null && newColFormat.currencySymbol !== '')
			f.currencySymbol = newColFormat.currencySymbol;
		const dp = newColFormat.decimalPlaces;
		if (isNumeric && typeof dp === 'number' && !Number.isNaN(dp) && dp >= 0) f.decimalPlaces = dp;
		if (isNumeric && newColFormat.thousandsSeparator === true) f.thousandsSeparator = true;
		return Object.keys(f).length ? f : null;
	}

	function openAddColumn() {
		editColumnId = null;
		confirmRemoveColumn = false;
		newColName = '';
		newColType = 'string';
		newColFormat = {};
		addColumnOpen = true;
	}

	function openEditColumn(col: ColumnRow) {
		editColumnId = col.id;
		confirmRemoveColumn = false;
		newColName = col.name;
		newColType = col.type;
		newColFormat = {
			currencySymbol: col.format?.currencySymbol ?? '',
			decimalPlaces: col.format?.decimalPlaces,
			thousandsSeparator: col.format?.thousandsSeparator ?? false
		};
		addColumnOpen = true;
	}

	async function saveColumn() {
		const name = newColName.trim();
		if (!name) return;
		const format = buildFormatPayload();
		try {
			if (editColumnId) {
				const res = await fetch(`/api/sheets/${sheetId}/columns/${editColumnId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name, type: newColType, format })
				});
				if (!res.ok) throw new Error('Failed to update column');
				columns = columns.map((c) =>
					c.id === editColumnId ? { ...c, name, type: newColType, format } : c
				);
			} else {
				const res = await fetch(`/api/sheets/${sheetId}/columns`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name, type: newColType, format })
				});
				if (!res.ok) throw new Error('Failed to add column');
				const col = await res.json();
				columns = [...columns, { id: col.id, name: col.name, type: col.type, order: col.order, sheetId, format: col.format ?? null }];
			}
			newColName = '';
			newColType = 'string';
			newColFormat = {};
			editColumnId = null;
			addColumnOpen = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}

	async function removeColumn() {
		if (!editColumnId) return;
		try {
			const res = await fetch(`/api/sheets/${sheetId}/columns/${editColumnId}`, {
				method: 'DELETE'
			});
			if (!res.ok) throw new Error('Failed to remove column');
			columns = columns.filter((c) => c.id !== editColumnId);
			cells = cells.filter((c) => c.columnId !== editColumnId);
			confirmRemoveColumn = false;
			editColumnId = null;
			newColName = '';
			newColType = 'string';
			newColFormat = {};
			addColumnOpen = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to remove column';
		}
	}

	async function addRow() {
		const cellValues: Record<string, string> = {};
		for (const col of columns) cellValues[col.id] = '';
		if (!connected) {
			const tempId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
			const nextOrderNum = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.orderNum ?? 0)) + 1;
			rows = [...rows, { id: tempId, sheetId: sheetId!, createdAt: null, orderNum: nextOrderNum }];
			for (const col of columns) cells = [...cells, { rowId: tempId, columnId: col.id, value: '' }];
			pendingOfflineRows = [...pendingOfflineRows, { tempId, cells: { ...cellValues } }];
			await tick();
			const lastTr = document.querySelector('table tbody tr:last-child');
			lastTr?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			return;
		}
		try {
			const res = await fetch(`/api/sheets/${sheetId}/rows`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ cells: cellValues })
			});
			if (!res.ok) throw new Error('Failed to add row');
			const json = await res.json();
			const id = json.id as string;
			const nextOrderNum = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.orderNum ?? 0)) + 1;
			rows = [...rows, { id, sheetId: sheetId!, createdAt: null, orderNum: nextOrderNum }];
			for (const col of columns) cells = [...cells, { rowId: id, columnId: col.id, value: '' }];
			isEditing = true;
			await tick();
			const lastTr = document.querySelector('table tbody tr:last-child');
			lastTr?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			const firstInput = lastTr?.querySelector<HTMLInputElement>('input');
			firstInput?.focus();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}

	let cellDebounce: ReturnType<typeof setTimeout> | null = null;
	function onCellChange(rowId: string, columnId: string, value: string) {
		cells = cells.map((c) =>
			c.rowId === rowId && c.columnId === columnId ? { ...c, value } : c
		);
		// Keep pending offline row cells in sync so they POST with correct values on reconnect
		if (rowId.startsWith('offline-')) {
			const pending = pendingOfflineRows.find((p) => p.tempId === rowId);
			if (pending) {
				pending.cells[columnId] = value;
				pendingOfflineRows = pendingOfflineRows;
			}
		}
		if (!connected) return;
		if (cellDebounce) clearTimeout(cellDebounce);
		cellDebounce = setTimeout(async () => {
			cellDebounce = null;
			try {
				await fetch(`/api/sheets/${sheetId}/cells`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ rowId, columnId, value })
				});
			} catch {
				// ignore
			}
		}, 300);
	}

	/** Deletes one row. When confirmFirst is true, shows a confirmation dialog (single delete). */
	async function deleteRowById(rowId: string, confirmFirst = true) {
		if (confirmFirst && !confirm('Delete this row?')) return;
		if (!connected && rowId.startsWith('offline-')) {
			rows = rows.filter((r) => r.id !== rowId);
			cells = cells.filter((c) => c.rowId !== rowId);
			pendingOfflineRows = pendingOfflineRows.filter((p) => p.tempId !== rowId);
			return;
		}
		try {
			const res = await fetch(`/api/sheets/${sheetId}/rows/${rowId}`, {
				method: 'DELETE'
			});
			if (!res.ok) throw new Error('Failed to delete');
			rows = rows.filter((r) => r.id !== rowId);
			cells = cells.filter((c) => c.rowId !== rowId);
			selectedRowIds = new Set([...selectedRowIds].filter((id) => id !== rowId));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}
	function onDeleteRow(rowId: string) {
		deleteRowById(rowId, true);
	}
	async function deleteSelectedRows() {
		const ids = Array.from(selectedRowIds);
		const n = ids.length;
		if (n === 0) return;
		if (!confirm(`Delete ${n} row${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
		for (const id of ids) {
			await deleteRowById(id, false);
		}
		selectedRowIds = new Set();
	}

	async function onRowReorder(fromIndex: number, toIndex: number) {
		const reordered = [...rows];
		const [removed] = reordered.splice(fromIndex, 1);
		reordered.splice(toIndex, 0, removed);
		const order = reordered.map((r) => r.id);
		try {
			const res = await fetch(`/api/sheets/${sheetId}/rows`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ order })
			});
			if (!res.ok) throw new Error('Failed to reorder');
			rows = reordered;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to reorder';
		}
	}

	async function onColumnReorder(fromIndex: number, toIndex: number) {
		const reordered = [...columns];
		const [removed] = reordered.splice(fromIndex, 1);
		reordered.splice(toIndex, 0, removed);
		const order = reordered.map((c) => c.id);
		try {
			const res = await fetch(`/api/sheets/${sheetId}/columns`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ order })
			});
			if (!res.ok) throw new Error('Failed to reorder columns');
			columns = reordered.map((c, i) => ({ ...c, order: i }));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to reorder columns';
		}
	}

	async function openShare() {
		shareOpen = true;
		try {
			const res = await fetch(`/api/sheets/${sheetId}/share-links`);
			if (!res.ok) throw new Error('Failed to load links');
			const json = await res.json();
			shareLinks = json.links ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}

	const adminUrl = $derived(`${baseUrl}/sheets/${sheetId}`);

	function copyLink(token: string) {
		const url = `${baseUrl}/s/${token}`;
		navigator.clipboard.writeText(url);
		copied = token;
		setTimeout(() => (copied = null), 2000);
	}

	function copyAdminLink() {
		navigator.clipboard.writeText(adminUrl);
		copied = 'admin';
		setTimeout(() => (copied = null), 2000);
	}

	async function saveSheetName() {
		if (!connected || !sheetId) return;
		const value = sheetName.trim();
		savingName = true;
		try {
			const res = await fetch(`/api/sheets/${sheetId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: value || '' })
			});
			if (!res.ok) throw new Error('Failed to save name');
			addOrUpdateSheet(sheetId, value || null);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save name';
		} finally {
			savingName = false;
		}
	}
</script>

<div>
<div class="min-h-screen bg-zinc-50 text-zinc-900">
	<header class="sticky top-0 z-20 border-b border-zinc-200 bg-white">
		<div class="mx-auto max-w-6xl px-4 py-3">
			<div class="flex items-center justify-between gap-4">
				<div class="flex shrink-0 items-center gap-3">
					<LogoLink openInNewTab={false} />
				</div>
				<div class="min-w-0 flex-1">
					<label for="sheet-name" class="sr-only">Sheet name</label>
					<input
						id="sheet-name"
						type="text"
						bind:value={sheetName}
						onblur={saveSheetName}
						onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
						disabled={!connected || savingName}
						placeholder="Untitled sheet"
						class="w-full rounded border-0 bg-transparent py-1 text-lg font-medium text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:opacity-70"
					/>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<button
						type="button"
						onclick={addRow}
						class="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
					>
						Add row
					</button>
					<button
						type="button"
						onclick={openShare}
						disabled={!connected}
						title={connected ? undefined : 'Available when online'}
						class="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Share
					</button>
				</div>
			</div>
			{#if selectedRowIds.size > 0}
				<div class="mt-3 flex items-center gap-3 border-t border-zinc-200 pt-3">
					<span class="text-sm text-zinc-700">
						{selectedRowIds.size} row{selectedRowIds.size === 1 ? '' : 's'} selected
					</span>
					<button
						type="button"
						onclick={deleteSelectedRows}
						class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
					>
						Delete rows
					</button>
					<button
						type="button"
						onclick={() => (selectedRowIds = new Set())}
						class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
					>
						Clear selection
					</button>
				</div>
			{/if}
		</div>
	</header>
	{#if !connected}
		<OfflineBanner connected={connected} pendingCount={pendingOfflineRows.length} />
	{/if}
	<main class="mx-auto max-w-6xl px-4 py-6">
		{#if error}
			<p class="mb-4 text-sm text-red-600" role="alert">{error}</p>
		{/if}
		{#if loading}
			<p class="text-zinc-500">Loading…</p>
		{:else}
			<DataTable
				columns={columns}
				rows={rows}
				cells={cells}
				editable={connected}
				editableRowIds={!connected && pendingOfflineRows.length > 0 ? new Set(pendingOfflineRows.map((p) => p.tempId)) : undefined}
				editingRowIds={!connected && pendingOfflineRows.length > 0 ? new Set(pendingOfflineRows.map((p) => p.tempId)) : undefined}
				onCellChange={onCellChange}
				onDeleteRow={onDeleteRow}
				selectedRowIds={selectedRowIds}
				onSelectedRowIdsChange={(ids) => (selectedRowIds = ids)}
				onColumnEdit={openEditColumn}
				onAddColumn={connected ? openAddColumn : undefined}
				onColumnReorder={connected ? onColumnReorder : undefined}
				onEditingStart={onEditingStart}
				onEditingEnd={onEditingEnd}
				onRowReorder={connected ? onRowReorder : undefined}
				permission="edit"
			/>
		{/if}
	</main>
</div>

{#if addColumnOpen}
	<div
		class="fixed inset-0 z-10 flex items-center justify-center bg-black/30"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => e.target === e.currentTarget && (addColumnOpen = false, confirmRemoveColumn = false)}
		onkeydown={(e) => e.key === 'Escape' && (confirmRemoveColumn ? (confirmRemoveColumn = false) : (addColumnOpen = false))}
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
			{#if confirmRemoveColumn}
				<h3 class="text-lg font-medium text-zinc-900">Remove column?</h3>
				<p class="mt-2 text-sm text-zinc-600">
					Remove column &quot;{newColName}&quot;? All data in this column will be permanently deleted. This cannot be undone.
				</p>
				<div class="mt-6 flex justify-end gap-2">
					<button
						type="button"
						onclick={() => (confirmRemoveColumn = false)}
						class="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={() => removeColumn()}
						class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
					>
						Remove column
					</button>
				</div>
			{:else}
				<h3 class="text-lg font-medium text-zinc-900">{editColumnId ? 'Edit column' : 'Add column'}</h3>
				<form
					onsubmit={(e) => {
						e.preventDefault();
						saveColumn();
					}}
					class="mt-4 space-y-4"
				>
					<div>
						<label for="col-name" class="block text-sm font-medium text-zinc-700">Name</label>
						<input
							id="col-name"
							type="text"
							bind:value={newColName}
							class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
						/>
					</div>
					<div>
						<label for="col-type" class="block text-sm font-medium text-zinc-700">Type</label>
						<select
							id="col-type"
							bind:value={newColType}
							class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
						>
							<option value="string">String</option>
							<option value="number">Number</option>
							<option value="date">Date</option>
							<option value="datetime">Date & time</option>
							<option value="currency">Currency</option>
							<option value="boolean">Boolean</option>
						</select>
					</div>
					{#if newColType === 'currency'}
						<div>
							<label for="col-currency-symbol" class="block text-sm font-medium text-zinc-700">Currency symbol</label>
							<input
								id="col-currency-symbol"
								type="text"
								bind:value={newColFormat.currencySymbol}
								placeholder="e.g. $, €, £"
								class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
							/>
						</div>
					{/if}
					{#if newColType === 'number' || newColType === 'currency'}
						<div>
							<label for="col-decimal-places" class="block text-sm font-medium text-zinc-700">Decimal places</label>
							<input
								id="col-decimal-places"
								type="number"
								min="0"
								max="10"
								bind:value={newColFormat.decimalPlaces}
								placeholder="Default"
								class="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
							/>
							<p class="mt-0.5 text-xs text-zinc-500">Leave empty for auto (0 for integers, 2 for decimals)</p>
						</div>
						<div class="flex items-center gap-2">
							<input
								id="col-thousands"
								type="checkbox"
								bind:checked={newColFormat.thousandsSeparator}
								class="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
							/>
							<label for="col-thousands" class="text-sm font-medium text-zinc-700">Use thousands separator</label>
						</div>
					{/if}
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div>
							{#if editColumnId}
								<button
									type="button"
									onclick={() => (confirmRemoveColumn = true)}
									class="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
								>
									Remove column
								</button>
							{/if}
						</div>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={() => (addColumnOpen = false)}
								class="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
							>
								Cancel
							</button>
							<button
								type="submit"
								class="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
							>
								{editColumnId ? 'Save' : 'Add'}
							</button>
						</div>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}

{#if shareOpen}
	<div
		class="fixed inset-0 z-10 flex items-center justify-center bg-black/30"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => e.target === e.currentTarget && (shareOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (shareOpen = false)}
	>
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
			<h3 class="text-lg font-medium text-zinc-900">Share links</h3>
			<p class="mt-1 text-sm text-zinc-500">Each link has different permissions.</p>
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
			<div class="mt-4 flex justify-end">
				<button
					type="button"
					onclick={() => (shareOpen = false)}
					class="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
				>
					Done
				</button>
			</div>
		</div>
	</div>
{/if}
</div>
