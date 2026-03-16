<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import SheetToolbar from '$lib/components/SheetToolbar.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import LogoLink from '$lib/components/LogoLink.svelte';
	import PermissionIcon from '$lib/components/PermissionIcon.svelte';
	import { createSheetStreamConnection } from '$lib/sseConnection';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';

	let { data } = $props();
	const token = $derived(page.params.token ?? '');
	const sheetId = $derived(data.sheetId);
	const permission = $derived(data.permission);

let columns = $state<{ id: string; name: string; type: string; format?: import('$lib/formatCell').ColumnFormat | null; width?: number | null }[]>([]);
	let rows = $state<{ id: string; sheetId: string; createdAt: Date | null }[]>([]);
	let cells = $state<{ rowId: string; columnId: string; value: string }[]>([]);
	let loading = $state(true);
	let sortColumnId = $state('');
	let sortDirection = $state<'asc' | 'desc'>('asc');
	let filters = $state<Record<string, string>>({});
	let headerFilterColumnId = $state<string | null>(null);
	let error = $state<string | null>(null);
	let initialLoadDone = $state(false);
	let sortInitialized = $state(false);

	/** SSE connection state; when false, editing is disabled and add-row is offline-only. */
	let connected = $state(true);
	/** Rows added while offline; synced when we reconnect. */
	let pendingOfflineRows = $state<{ tempId: string; cells: Record<string, string> }[]>([]);
	let deleteRowId = $state<string | null>(null);

	function getSortStorageKey() {
		if (!sheetId) return null;
		return `sheet-sort:${sheetId}:${permission}`;
	}

	function loadSortFromStorage(): { columnId: string; direction: 'asc' | 'desc' } | null {
		if (typeof window === 'undefined') return null;
		const key = getSortStorageKey();
		if (!key) return null;
		try {
			const raw = window.localStorage.getItem(key);
			if (!raw) return null;
			const parsed = JSON.parse(raw) as { columnId?: string; direction?: string };
			if (
				typeof parsed.columnId === 'string' &&
				(parsed.direction === 'asc' || parsed.direction === 'desc')
			) {
				return { columnId: parsed.columnId, direction: parsed.direction };
			}
		} catch {
			// ignore malformed data
		}
		return null;
	}

	function saveSortToStorage(columnId: string, direction: 'asc' | 'desc') {
		if (typeof window === 'undefined') return;
		const key = getSortStorageKey();
		if (!key) return;
		try {
			if (!columnId) {
				window.localStorage.removeItem(key);
			} else {
				window.localStorage.setItem(
					key,
					JSON.stringify({ columnId, direction })
				);
			}
		} catch {
			// best-effort only
		}
	}

	$effect(() => {
		const urlSortColumn = data.sort ?? '';
		const urlSortDirection = (data.dir ?? 'asc') as 'asc' | 'desc';

		if (!sortInitialized) {
			if (urlSortColumn) {
				sortColumnId = urlSortColumn;
				sortDirection = urlSortDirection;
			} else {
				const stored = loadSortFromStorage();
				if (stored) {
					sortColumnId = stored.columnId;
					sortDirection = stored.direction;
				} else {
					sortColumnId = '';
					sortDirection = 'asc';
				}
			}
			sortInitialized = true;
		}

		filters = data.filters ?? {};
	});
	let adding = $state(false);
	/** Row IDs added this session (append users can edit only these until they leave). */
	let sessionAddedRowIds = $state<Set<string>>(new Set());
	/** Which of those rows are currently in edit mode (tick/x vs pencil). */
	let editingRowIds = $state<Set<string>>(new Set());
	let isEditing = $state(false);
	let pendingRows = $state<{ id: string; sheetId: string; createdAt: Date | null }[] | null>(null);
	let pendingCells = $state<{ rowId: string; columnId: string; value: string }[] | null>(null);

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

	const canAppend = $derived(permission === 'append' || permission === 'edit');
	const canEdit = $derived(permission === 'edit');
	const canDelete = $derived(permission === 'edit');
	/** Rows that are editable: all if canEdit, else only session-added if canAppend (when connected), else offline-added when disconnected. */
	const editableRowIds = $derived(
		canEdit
			? undefined
			: canAppend && (connected ? sessionAddedRowIds.size > 0 : pendingOfflineRows.length > 0)
				? connected
					? sessionAddedRowIds
					: new Set(pendingOfflineRows.map((p) => p.tempId))
				: undefined
	);

	function buildRowsUrl() {
		const u = new URL(`/api/sheets/${sheetId}/rows`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
		u.searchParams.set('token', token);
		if (sortColumnId) {
			u.searchParams.set('sortColumnId', sortColumnId);
			u.searchParams.set('sortDirection', sortDirection);
		}
		for (const [colId, param] of Object.entries(filters)) u.searchParams.set(`filter_${colId}`, param);
		return u.toString();
	}

	function syncUrl() {
		const u = new URL(page.url);
		if (sortColumnId) {
			u.searchParams.set('sort', sortColumnId);
			u.searchParams.set('dir', sortDirection);
		} else {
			u.searchParams.delete('sort');
			u.searchParams.delete('dir');
		}
		for (const [k, v] of Object.entries(filters)) u.searchParams.set(`filter_${k}`, v);
		for (const k of [...u.searchParams.keys()]) {
			if (k.startsWith('filter_') && !filters[k.slice(7)]) u.searchParams.delete(k);
		}
		const target = u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '');
		if (target !== page.url.pathname + (page.url.search || '')) {
			replaceState(target, {});
		}
	}

	let fetchAbort: AbortController | null = null;
	/** When true, next fetch applies to rows/cells directly so sort/filter changes update the table even if user had focus in a cell. */
	let applyFetchDirectly = $state(false);

	async function fetchData() {
		fetchAbort?.abort();
		fetchAbort = new AbortController();
		const { signal } = fetchAbort;
		try {
			const [sheetRes, rowsRes] = await Promise.all([
				fetch(`/api/sheets/${sheetId}?token=${encodeURIComponent(token)}`, { signal, cache: 'no-store' }),
				fetch(buildRowsUrl(), { signal, cache: 'no-store' })
			]);
			if (!sheetRes.ok || !rowsRes.ok) throw new Error('Failed to load');
			const sheetJson = await sheetRes.json();
			const rowsJson = await rowsRes.json();
			columns = sheetJson.columns ?? [];
			const newRows = rowsJson.rows ?? [];
			const newCells = rowsJson.cells ?? [];
			if (applyFetchDirectly) {
				rows = newRows;
				cells = newCells;
				applyFetchDirectly = false;
			} else if (isEditing) {
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

	async function syncPendingOfflineRows() {
		if (pendingOfflineRows.length === 0) return;
		const toSync = [...pendingOfflineRows];
		pendingOfflineRows = [];
		rows = rows.filter((r) => !r.id.startsWith('offline-'));
		cells = cells.filter((c) => !c.rowId.startsWith('offline-'));
		for (let i = 0; i < toSync.length; i++) {
			const { cells: cellValues } = toSync[i];
			try {
				const res = await fetch(`/api/sheets/${sheetId}/rows`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Share-Token': token
					},
					body: JSON.stringify({ cells: cellValues })
				});
				if (!res.ok) throw new Error('Sync failed');
				const { id } = await res.json();
				sessionAddedRowIds = new Set([...sessionAddedRowIds, id]);
				editingRowIds = new Set([...editingRowIds, id]);
			} catch {
				pendingOfflineRows = toSync.slice(i);
				break;
			}
		}
		fetchData();
	}

	onMount(() => {
		columns = [...data.columns];
		initialLoadDone = true;

		let sseDebounce: ReturnType<typeof setTimeout> | null = null;
		let wasConnected = false;
		const cleanup = createSheetStreamConnection(
			typeof window !== 'undefined'
				? `${window.location.origin}/api/sheets/${sheetId}/stream?token=${encodeURIComponent(token)}`
				: '',
			{
				onConnectedChange(nowConnected) {
					connected = nowConnected;
					if (nowConnected && wasConnected === false) {
						if (pendingOfflineRows.length > 0) syncPendingOfflineRows();
						else fetchData();
					}
					wasConnected = nowConnected;
				},
				onMessage() {
					if (sseDebounce) clearTimeout(sseDebounce);
					sseDebounce = setTimeout(() => {
						sseDebounce = null;
						fetchData();
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

	// Plain variable so the effect doesn't re-run when we increment (avoids "updated at" error)
	let sortFilterEffectRuns = 0;
	$effect(() => {
		if (typeof window === 'undefined' || !initialLoadDone) return;
		sortColumnId;
		sortDirection;
		filters;
		syncUrl();
		// When user changes sort/filter, apply fetched data to rows/cells immediately (don't stash in pending)
		if (sortFilterEffectRuns > 0) applyFetchDirectly = true;
		sortFilterEffectRuns++;
		fetchData();
	});

	async function addRow() {
		if (!canAppend) return;
		const cellsPayload: Record<string, string> = {};
		for (const col of columns) cellsPayload[col.id] = '';
		if (!connected) {
			const tempId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
			rows = [...rows, { id: tempId, sheetId, createdAt: null }];
			for (const col of columns) cells = [...cells, { rowId: tempId, columnId: col.id, value: '' }];
			pendingOfflineRows = [...pendingOfflineRows, { tempId, cells: { ...cellsPayload } }];
			await tick();
			const lastTr = document.querySelector('table tbody tr:last-child');
			lastTr?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			return;
		}
		adding = true;
		error = null;
		try {
			const res = await fetch(`/api/sheets/${sheetId}/rows`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Share-Token': token as string
				},
				body: JSON.stringify({ cells: cellsPayload })
			});
			if (!res.ok) throw new Error('Failed to add row');
			const { id } = await res.json();
			rows = [...rows, { id, sheetId, createdAt: null }];
			for (const col of columns) cells = [...cells, { rowId: id, columnId: col.id, value: '' }];
			sessionAddedRowIds = new Set([...sessionAddedRowIds, id]);
			editingRowIds = new Set([...editingRowIds, id]);
			isEditing = true;
			await tick();
			const lastTr = document.querySelector('table tbody tr:last-child');
			lastTr?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			const firstInput = lastTr?.querySelector<HTMLInputElement>('input');
			firstInput?.focus();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		} finally {
			adding = false;
		}
	}

	function onStartEdit(rowId: string) {
		editingRowIds = new Set([...editingRowIds, rowId]);
	}

	function onConfirmEdit(rowId: string) {
		editingRowIds = new Set([...editingRowIds].filter((id) => id !== rowId));
	}

	let cellDebounce: ReturnType<typeof setTimeout> | null = null;
	function onCellChange(rowId: string, columnId: string, value: string) {
		const canEditThisRow = canEdit || (canAppend && (sessionAddedRowIds.has(rowId) || rowId.startsWith('offline-')));
		if (!canEditThisRow) return;
		cells = cells.map((c) =>
			c.rowId === rowId && c.columnId === columnId ? { ...c, value } : c
		);
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
					headers: {
						'Content-Type': 'application/json',
						'X-Share-Token': token as string
					},
					body: JSON.stringify({ rowId, columnId, value })
				});
			} catch {
				// ignore
			}
		}, 300);
	}

	function requestDeleteRow(rowId: string) {
		if (!canDelete && !(canAppend && (sessionAddedRowIds.has(rowId) || rowId.startsWith('offline-')))) return;
		deleteRowId = rowId;
	}

	async function confirmDeleteRow() {
		if (!deleteRowId) return;
		const rowId = deleteRowId;
		deleteRowId = null;
		if (!connected && rowId.startsWith('offline-')) {
			rows = rows.filter((r) => r.id !== rowId);
			cells = cells.filter((c) => c.rowId !== rowId);
			pendingOfflineRows = pendingOfflineRows.filter((p) => p.tempId !== rowId);
			return;
		}
		try {
			const res = await fetch(`/api/sheets/${sheetId}/rows/${rowId}`, {
				method: 'DELETE',
				headers: { 'X-Share-Token': token as string }
			});
			if (!res.ok) throw new Error('Failed to delete');
			rows = rows.filter((r) => r.id !== rowId);
			cells = cells.filter((c) => c.rowId !== rowId);
			sessionAddedRowIds = new Set([...sessionAddedRowIds].filter((id) => id !== rowId));
			editingRowIds = new Set([...editingRowIds].filter((id) => id !== rowId));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed';
		}
	}
</script>

<div class="min-h-screen bg-zinc-50 text-zinc-900">
	<header class="sticky top-0 z-20 border-b border-zinc-200 bg-white">
		<OfflineBanner connected={connected} pendingCount={pendingOfflineRows.length} />
		<div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
			<div class="flex min-w-0 shrink items-center gap-3">
				<LogoLink />
				<span class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600">
					<PermissionIcon permission={permission as 'read' | 'append' | 'edit'} class="text-zinc-600" />
				</span>
				<h1 class="truncate text-lg font-medium text-zinc-800">{data.name ?? 'Shared sheet'}</h1>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<SheetToolbar
					columns={columns}
					filters={filters}
					onFiltersChange={(next) => {
						filters = next ?? {};
					}}
					openForColumnId={headerFilterColumnId ?? ''}
					onFilterModalClosed={() => {
						headerFilterColumnId = null;
					}}
					inHeader={true}
				/>
				{#if canAppend}
					<button
						type="button"
						disabled={adding}
						onclick={addRow}
						class="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
					>
						{adding ? 'Adding…' : 'Add row'}
					</button>
				{/if}
			</div>
		</div>
	</header>
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
				sortColumnId={sortColumnId}
				sortDirection={sortDirection}
				onSortChange={(colId, dir) => {
					sortColumnId = colId;
					sortDirection = dir;
					saveSortToStorage(colId, dir);
				}}
				editable={canEdit ? connected : (canAppend && !connected && pendingOfflineRows.length > 0)}
				editableRowIds={editableRowIds}
				editingRowIds={editableRowIds != null ? (connected ? editingRowIds : new Set(pendingOfflineRows.map((p) => p.tempId))) : undefined}
				onCellChange={onCellChange}
				onDeleteRow={canEdit || canAppend ? requestDeleteRow : undefined}
				onStartEdit={canAppend && !canEdit ? onStartEdit : undefined}
				onConfirmEdit={canAppend && !canEdit ? onConfirmEdit : undefined}
				onEditingStart={onEditingStart}
				onEditingEnd={onEditingEnd}
				onHeaderFilterClick={(columnId) => {
					headerFilterColumnId = columnId;
				}}
				permission={permission}
			/>
		{/if}
	</main>

	<Modal
		open={deleteRowId !== null}
		title="Delete this row?"
		description="This action cannot be undone."
		onClose={() => (deleteRowId = null)}
		onPrimary={confirmDeleteRow}
		primaryLabel="Delete row"
		primaryVariant="danger"
	/>
</div>
