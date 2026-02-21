<script lang="ts">
	interface Column {
		id: string;
		name: string;
		type: string;
	}

	let {
		columns = [],
		filters = $bindable<Record<string, string>>({}),
		onApplyFilter = (_columnId: string, _op: string, _value: string) => {},
		inHeader = false
	}: {
		columns: Column[];
		filters?: Record<string, string>;
		onApplyFilter?: (columnId: string, op: string, value: string) => void;
		inHeader?: boolean;
	} = $props();

	let filterOpen = $state(false);
	let filterColId = $state('');
	let filterOp = $state('contains');
	let filterValue = $state('');
	let filterCaseSensitive = $state(false);

	const filterCol = $derived(columns.find((c) => c.id === filterColId));
	const isNumber = $derived(filterCol?.type === 'number' || filterCol?.type === 'currency');
	const isDate = $derived(filterCol?.type === 'date' || filterCol?.type === 'datetime');

	function applyFilter() {
		if (!filterColId) return;
		const op = isNumber ? filterOp : isDate ? (filterOp as string) : filterOp;
		let val = filterValue;
		if (filterCaseSensitive && !isNumber && !isDate) val = `case:${val}`;
		onApplyFilter(filterColId, op, val);
		filters = { ...filters, [filterColId]: `${op}:${val}` };
		filterOpen = false;
		filterValue = '';
	}
	function clearFilter(columnId: string) {
		const next = { ...filters };
		delete next[columnId];
		filters = next;
	}
</script>

<div class="{inHeader ? '' : 'mb-4'} flex flex-wrap items-center gap-2">
	{#each Object.entries(filters) as [colId, param]}
		{@const col = columns.find((c) => c.id === colId)}
		<span
			class="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-1 text-xs text-zinc-700"
		>
			{col?.name ?? colId}: {param}
			<button
				type="button"
				aria-label="Remove filter"
				onclick={() => clearFilter(colId)}
				class="rounded hover:bg-zinc-300"
			>
				×
			</button>
		</span>
	{/each}
	<button
		type="button"
		onclick={() => (filterOpen = !filterOpen)}
		class="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
	>
		Add filter
	</button>
</div>

{#if filterOpen}
	<div
		class="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
		role="dialog"
		aria-label="Filter"
		tabindex="-1"
	>
		<h4 class="text-sm font-medium text-zinc-800">Filter by column</h4>
		<div class="mt-3 flex flex-wrap items-end gap-3">
			<div>
				<label for="filter-col" class="block text-xs text-zinc-500">Column</label>
				<select
					id="filter-col"
					bind:value={filterColId}
					class="mt-0.5 rounded border border-zinc-300 px-2 py-1.5 text-sm"
				>
					<option value="">Select…</option>
					{#each columns as col}
						<option value={col.id}>{col.name}</option>
					{/each}
				</select>
			</div>
			{#if filterColId}
				{#if isNumber}
					<div>
						<label for="filter-op" class="block text-xs text-zinc-500">Operator</label>
						<select id="filter-op" bind:value={filterOp} class="mt-0.5 rounded border border-zinc-300 px-2 py-1.5 text-sm">
							<option value="gt">Greater than</option>
							<option value="lt">Less than</option>
							<option value="eq">Equals</option>
						</select>
					</div>
					<div>
						<label for="filter-val" class="block text-xs text-zinc-500">Value</label>
						<input
							id="filter-val"
							type="number"
							bind:value={filterValue}
							class="mt-0.5 rounded border border-zinc-300 px-2 py-1.5 text-sm"
						/>
					</div>
				{:else if isDate}
					<div>
						<label for="filter-op-d" class="block text-xs text-zinc-500">Range</label>
						<select id="filter-op-d" bind:value={filterOp} class="mt-0.5 rounded border border-zinc-300 px-2 py-1.5 text-sm">
							<option value="dateFrom">From date</option>
							<option value="dateTo">To date</option>
						</select>
					</div>
					<div>
						<label for="filter-val-d" class="block text-xs text-zinc-500">Value</label>
						<input
							id="filter-val-d"
							type="date"
							bind:value={filterValue}
							class="mt-0.5 rounded border border-zinc-300 px-2 py-1.5 text-sm"
						/>
					</div>
				{:else}
					<div>
						<label for="filter-op-s" class="block text-xs text-zinc-500">Match</label>
						<select id="filter-op-s" bind:value={filterOp} class="mt-0.5 rounded border border-zinc-300 px-2 py-1.5 text-sm">
							<option value="startsWith">Starts with</option>
							<option value="endsWith">Ends with</option>
							<option value="contains">Contains</option>
						</select>
					</div>
					<div>
						<label for="filter-val-s" class="block text-xs text-zinc-500">Value</label>
						<input
							id="filter-val-s"
							type="text"
							bind:value={filterValue}
							class="mt-0.5 rounded border border-zinc-300 px-2 py-1.5 text-sm"
						/>
					</div>
					<label class="flex items-center gap-2 text-sm text-zinc-600">
						<input type="checkbox" bind:checked={filterCaseSensitive} />
						Case sensitive
					</label>
				{/if}
			{/if}
			<button
				type="button"
				onclick={applyFilter}
				disabled={!filterColId || (!filterValue && !isNumber)}
				class="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
			>
				Apply
			</button>
		</div>
	</div>
{/if}
