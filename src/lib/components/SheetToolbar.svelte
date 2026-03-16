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
		inHeader = false,
		openForColumnId = '',
		onFilterModalClosed = undefined as (() => void) | undefined
	}: {
		columns: Column[];
		filters?: Record<string, string>;
		onApplyFilter?: (columnId: string, op: string, value: string) => void;
		inHeader?: boolean;
		/** When set to a column ID, the filter modal opens with that column preselected. */
		openForColumnId?: string;
		/** Optional callback so the parent can clear openForColumnId when the modal closes. */
		onFilterModalClosed?: () => void;
	} = $props();

	let filterOpen = $state(false);
	let filterColId = $state('');
	let filterOp = $state('contains');
	let filterValue = $state('');
	let filterCaseSensitive = $state(false);

	const filterCol = $derived(columns.find((c) => c.id === filterColId));
	const isNumber = $derived(filterCol?.type === 'number' || filterCol?.type === 'currency');
	const isDate = $derived(filterCol?.type === 'date' || filterCol?.type === 'datetime');

	$effect(() => {
		if (!openForColumnId) return;
		const target = columns.find((c) => c.id === openForColumnId);
		if (!target) return;
		filterColId = target.id;
		filterOpen = true;
		filterOp = target.type === 'number' || target.type === 'currency' ? 'gt' : 'contains';
		filterValue = '';
		filterCaseSensitive = false;
	});

	function applyFilter() {
		if (!filterColId) return;
		const op = isNumber ? filterOp : isDate ? (filterOp as string) : filterOp;
		let val = filterValue;
		if (filterCaseSensitive && !isNumber && !isDate) val = `case:${val}`;
		onApplyFilter(filterColId, op, val);
		filters = { ...filters, [filterColId]: `${op}:${val}` };
		filterOpen = false;
		onFilterModalClosed?.();
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
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
		role="presentation"
		tabindex="-1"
		aria-label="Filter backdrop"
		onclick={() => {
			filterOpen = false;
			onFilterModalClosed?.();
		}}
		onkeydown={(event) => {
			if (event.key === 'Escape') filterOpen = false;
		}}
	>
		<div
			class="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl ring-1 ring-black/5"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-label="Filter rows"
			onclick={(event) => event.stopPropagation()}
			onkeydown={(event) => {
				if (event.key === 'Escape') {
					filterOpen = false;
					onFilterModalClosed?.();
				}
			}}
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<h4 class="text-sm font-semibold text-zinc-900">Filter rows</h4>
					<p class="mt-1 text-xs text-zinc-500">
						Choose a column and condition to narrow down the rows in this sheet.
					</p>
				</div>
				<button
					type="button"
					class="-m-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
					aria-label="Close filter"
					onclick={() => {
						filterOpen = false;
						onFilterModalClosed?.();
					}}
				>
					<span class="text-lg leading-none">&times;</span>
				</button>
			</div>

			<div class="mt-5 space-y-4">
				<div class="space-y-2">
					<label for="filter-col" class="block text-xs font-medium text-zinc-600">Column</label>
					<select
						id="filter-col"
						bind:value={filterColId}
						class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
					>
						<option value="">Select a column…</option>
						{#each columns as col}
							<option value={col.id}>{col.name}</option>
						{/each}
					</select>
				</div>

				{#if filterColId}
					{#if isNumber}
						<div class="grid gap-3 sm:grid-cols-2">
							<div class="space-y-2">
								<label for="filter-op" class="block text-xs font-medium text-zinc-600"
									>Operator</label
								>
								<select
									id="filter-op"
									bind:value={filterOp}
									class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
								>
									<option value="gt">Greater than</option>
									<option value="lt">Less than</option>
									<option value="eq">Equals</option>
								</select>
							</div>
							<div class="space-y-2">
								<label for="filter-val" class="block text-xs font-medium text-zinc-600"
									>Value</label
								>
								<input
									id="filter-val"
									type="number"
									bind:value={filterValue}
									class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
								/>
							</div>
						</div>
					{:else if isDate}
						<div class="grid gap-3 sm:grid-cols-2">
							<div class="space-y-2">
								<label for="filter-op-d" class="block text-xs font-medium text-zinc-600"
									>Range</label
								>
								<select
									id="filter-op-d"
									bind:value={filterOp}
									class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
								>
									<option value="dateFrom">From date</option>
									<option value="dateTo">To date</option>
								</select>
							</div>
							<div class="space-y-2">
								<label for="filter-val-d" class="block text-xs font-medium text-zinc-600"
									>Value</label
								>
								<input
									id="filter-val-d"
									type="date"
									bind:value={filterValue}
									class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
								/>
							</div>
						</div>
					{:else}
						<div class="space-y-4">
							<div class="grid gap-3 sm:grid-cols-2">
								<div class="space-y-2">
									<label for="filter-op-s" class="block text-xs font-medium text-zinc-600"
										>Match</label
									>
									<select
										id="filter-op-s"
										bind:value={filterOp}
										class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
									>
										<option value="startsWith">Starts with</option>
										<option value="endsWith">Ends with</option>
										<option value="contains">Contains</option>
									</select>
								</div>
								<div class="space-y-2">
									<label for="filter-val-s" class="block text-xs font-medium text-zinc-600"
										>Value</label
									>
									<input
										id="filter-val-s"
										type="text"
										bind:value={filterValue}
										class="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
									/>
								</div>
							</div>
							<label class="inline-flex items-center gap-2 text-xs font-medium text-zinc-600">
								<input
									type="checkbox"
									bind:checked={filterCaseSensitive}
									class="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
								/>
								<span>Case sensitive</span>
							</label>
						</div>
					{/if}
				{/if}

				<div class="mt-2 flex justify-end gap-2">
					<button
						type="button"
						class="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
						onclick={() => {
							filterOpen = false;
							onFilterModalClosed?.();
						}}
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={applyFilter}
						disabled={!filterColId || (!filterValue && !isNumber)}
						class="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Apply filter
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
