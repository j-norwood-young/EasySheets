<script lang="ts" generics="T extends { id: string }">
	import LinkifiedText from '$lib/components/LinkifiedText.svelte'
	import { formatCellDisplay } from '$lib/formatCell'
	import type { ColumnFormat } from '$lib/formatCell'

	interface Column {
		id: string
		name: string
		type: string
		format?: ColumnFormat | null
		/** Optional fixed width in pixels, shared across views. */
		width?: number | null
	}
	interface Cell {
		rowId: string
		columnId: string
		value: string
	}

	let {
		columns = [],
		rows = [],
		cells = [],
		sortColumnId = '',
		sortDirection = 'asc' as 'asc' | 'desc',
		onSortChange = undefined as
			| ((columnId: string, direction: 'asc' | 'desc') => void)
			| undefined,
		editable = false,
		editableRowIds = undefined as Set<string> | undefined,
		editingRowIds = undefined as Set<string> | undefined,
		onCellChange = (_rowId: string, _columnId: string, _value: string) => {},
		onDeleteRow = undefined as ((rowId: string) => void) | undefined,
		onStartEdit = undefined as ((rowId: string) => void) | undefined,
		onConfirmEdit = undefined as ((rowId: string) => void) | undefined,
		onColumnEdit = undefined as ((col: Column) => void) | undefined,
		onEditingStart = undefined as (() => void) | undefined,
		onEditingEnd = undefined as (() => void) | undefined,
		onRowReorder = undefined as ((fromIndex: number, toIndex: number) => void) | undefined,
		onAddColumn = undefined as (() => void) | undefined,
		onColumnReorder = undefined as ((fromIndex: number, toIndex: number) => void) | undefined,
		selectedRowIds = undefined as Set<string> | undefined,
		onSelectedRowIdsChange = undefined as ((ids: Set<string>) => void) | undefined,
		onColumnResize = undefined as ((columnId: string, width: number) => void) | undefined,
		onHeaderFilterClick = undefined as ((columnId: string) => void) | undefined,
		permission = 'edit',
	}: {
		columns: Column[]
		rows: T[]
		cells: Cell[]
		sortColumnId?: string
		sortDirection?: 'asc' | 'desc'
		/** When set, column headers are clickable to sort; first click asc, second desc, third clears. */
		onSortChange?: (columnId: string, direction: 'asc' | 'desc') => void
		editable?: boolean
		/** When set, only rows whose id is in this set can be toggled to edit (append mode). */
		editableRowIds?: Set<string>
		/** When editableRowIds is set, which of those rows are currently in edit mode. */
		editingRowIds?: Set<string>
		onCellChange?: (rowId: string, columnId: string, value: string) => void
		onDeleteRow?: (rowId: string) => void
		onStartEdit?: (rowId: string) => void
		onConfirmEdit?: (rowId: string) => void
		onColumnEdit?: (col: Column) => void
		/** Fires when any cell input inside the table gains focus. */
		onEditingStart?: () => void
		/** Fires when focus leaves the table entirely (debounced so tab between cells doesn't trigger it). */
		onEditingEnd?: () => void
		/** When set, a drag handle column is shown and rows can be reordered. */
		onRowReorder?: (fromIndex: number, toIndex: number) => void
		/** When set, a plus icon is shown in the row-actions header to add a column (admin view). */
		onAddColumn?: () => void
		/** When set, column headers have a drag handle and columns can be reordered. */
		onColumnReorder?: (fromIndex: number, toIndex: number) => void
		/** When set with onSelectedRowIdsChange, a checkbox column is shown for multi-select (e.g. bulk delete). */
		selectedRowIds?: Set<string>
		onSelectedRowIdsChange?: (ids: Set<string>) => void
		/** Callback when user clicks the header filter icon for a column (shared view). */
		onHeaderFilterClick?: (columnId: string) => void
		/** When 'edit', admin-level controls are shown (including column resize). */
		permission?: string
		/** When set, admin can drag a resize handle on column headers to set fixed widths. */
		onColumnResize?: (columnId: string, width: number) => void
	} = $props()

	let blurTimer: ReturnType<typeof setTimeout> | null = null
	function handleTableFocusIn() {
		if (blurTimer) {
			clearTimeout(blurTimer)
			blurTimer = null
		}
		onEditingStart?.()
	}
	function handleTableFocusOut() {
		if (blurTimer) clearTimeout(blurTimer)
		blurTimer = setTimeout(() => {
			blurTimer = null
			onEditingEnd?.()
		}, 150)
	}

	const cellMap = $derived(new Map(cells.map((c) => [`${c.rowId}:${c.columnId}`, c.value])))
	function getCell(rowId: string, columnId: string): string {
		return cellMap.get(`${rowId}:${columnId}`) ?? ''
	}
	const canDelete = $derived(permission === 'edit' && !!onDeleteRow)
	const showSelectionColumn = $derived(
		canDelete && selectedRowIds != null && onSelectedRowIdsChange != null
	)
	const allRowIds = $derived(rows.map((r) => r.id))
	const selectAllChecked = $derived(
		showSelectionColumn &&
			selectedRowIds != null &&
			allRowIds.length > 0 &&
			allRowIds.every((id) => selectedRowIds!.has(id))
	)
	const selectAllIndeterminate = $derived(
		showSelectionColumn &&
			selectedRowIds != null &&
			selectedRowIds.size > 0 &&
			selectedRowIds.size < allRowIds.length
	)
	/** Show tick/x (edit mode) or pencil (view mode) for append-editable rows. */
	const showAppendActions = $derived(
		editableRowIds != null && (onStartEdit != null || onConfirmEdit != null)
	)

	/** Input type and step for non-boolean columns; 'checkbox' for boolean. */
	function getInputSpec(colType: string): { type: string; step?: string } {
		switch (colType) {
			case 'number':
				return { type: 'number' }
			case 'currency':
				return { type: 'number', step: '0.01' }
			case 'date':
				return { type: 'date' }
			case 'datetime':
				return { type: 'datetime-local' }
			case 'boolean':
				return { type: 'checkbox' }
			default:
				return { type: 'text' }
		}
	}

	/** Value for date/datetime inputs: normalize to the format the input expects. */
	function getInputValue(col: Column, rowId: string): string {
		const raw = getCell(rowId, col.id)
		if (col.type === 'datetime' && raw) {
			// datetime-local expects YYYY-MM-DDTHH:mm; strip seconds and timezone if present
			const trimmed = raw.trim().slice(0, 16)
			return trimmed.length >= 16 ? trimmed : raw
		}
		return raw
	}

	function isBooleanTrue(value: string): boolean {
		const v = value.toLowerCase().trim()
		return v === 'true' || v === '1' || v === 'yes'
	}

	/** True if this row's cells should show as editable (inputs). */
	function isRowEditable(rowId: string): boolean {
		if (editableRowIds != null) return (editingRowIds ?? new Set()).has(rowId)
		return editable
	}

	/** True if this row shows append actions (pencil or tick/x). */
	function isAppendEditableRow(rowId: string): boolean {
		return editableRowIds != null && editableRowIds.has(rowId)
	}

	function isRowInEditMode(rowId: string): boolean {
		return (editingRowIds ?? new Set()).has(rowId)
	}

	let dragIndex = $state<number | null>(null)
	function handleDragStart(e: DragEvent, index: number) {
		dragIndex = index
		e.dataTransfer?.setData('text/plain', String(index))
		e.dataTransfer!.effectAllowed = 'move'
		if (e.target instanceof HTMLElement) e.target.classList.add('opacity-50')
	}
	function handleDragEnd(e: DragEvent) {
		if (e.target instanceof HTMLElement) e.target.classList.remove('opacity-50')
		dragIndex = null
	}
	function handleDragOver(e: DragEvent, index: number) {
		e.preventDefault()
		e.dataTransfer!.dropEffect = 'move'
	}
	function handleDrop(e: DragEvent, toIndex: number) {
		e.preventDefault()
		if (dragIndex == null || dragIndex === toIndex) return
		onRowReorder?.(dragIndex, toIndex)
		dragIndex = null
	}

	const MIN_COL_WIDTH = 80
	const MAX_COL_WIDTH = 600

	const headerCells = new Map<string, HTMLTableCellElement>()
	function registerHeader(node: HTMLTableCellElement, columnId: string) {
		headerCells.set(columnId, node)
		return {
			destroy() {
				headerCells.delete(columnId)
			},
		}
	}

	let resizingColumnId = $state<string | null>(null)
	let resizeStartX = 0
	let resizeStartWidth = 0

	function handleResizeMouseDown(event: MouseEvent, columnId: string) {
		if (!onColumnResize) return
		event.stopPropagation()
		event.preventDefault()
		const header = headerCells.get(columnId)
		if (!header) return
		const rect = header.getBoundingClientRect()
		resizingColumnId = columnId
		resizeStartX = event.clientX
		resizeStartWidth = rect.width
		window.addEventListener('mousemove', handleResizeMouseMove)
		window.addEventListener('mouseup', handleResizeMouseUp)
	}

	function handleResizeMouseMove(event: MouseEvent) {
		if (!resizingColumnId || !onColumnResize) return
		const delta = event.clientX - resizeStartX
		let nextWidth = Math.round(resizeStartWidth + delta)
		if (!Number.isFinite(nextWidth)) return
		if (nextWidth < MIN_COL_WIDTH) nextWidth = MIN_COL_WIDTH
		if (nextWidth > MAX_COL_WIDTH) nextWidth = MAX_COL_WIDTH
		onColumnResize(resizingColumnId, nextWidth)
	}

	function handleResizeMouseUp() {
		if (!resizingColumnId) return
		resizingColumnId = null
		window.removeEventListener('mousemove', handleResizeMouseMove)
		window.removeEventListener('mouseup', handleResizeMouseUp)
	}

	let columnDragIndex = $state<number | null>(null)
	let columnDragImageEl: HTMLElement | null = null
	function handleColumnDragStart(e: DragEvent, index: number, columnName: string) {
		columnDragIndex = index
		e.dataTransfer?.setData('text/plain', 'col-' + index)
		e.dataTransfer!.effectAllowed = 'move'
		if (e.currentTarget instanceof HTMLElement) e.currentTarget.classList.add('opacity-50')

		// Custom drag image so it's clear what's being dragged
		const dt = e.dataTransfer
		if (dt) {
			const ghost = document.createElement('div')
			ghost.textContent = columnName
			ghost.setAttribute('aria-hidden', 'true')
			Object.assign(ghost.style, {
				position: 'absolute',
				top: '-9999px',
				left: '0',
				padding: '6px 12px',
				background: 'white',
				border: '1px solid rgb(228 228 231)',
				borderRadius: '6px',
				boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
				fontSize: '14px',
				fontWeight: '500',
				color: 'rgb(39 39 42)',
				whiteSpace: 'nowrap',
				pointerEvents: 'none',
			})
			document.body.appendChild(ghost)
			columnDragImageEl = ghost
			dt.setDragImage(ghost, Math.min(ghost.offsetWidth / 2, 80), ghost.offsetHeight / 2)
		}
	}
	function handleColumnDragEnd(e: DragEvent) {
		if (e.currentTarget instanceof HTMLElement) e.currentTarget.classList.remove('opacity-50')
		if (columnDragImageEl?.parentNode)
			columnDragImageEl.parentNode.removeChild(columnDragImageEl)
		columnDragImageEl = null
		columnDragIndex = null
	}
	function handleColumnDragOver(e: DragEvent, index: number) {
		e.preventDefault()
		e.dataTransfer!.dropEffect = 'move'
	}
	function handleColumnDrop(e: DragEvent, toIndex: number) {
		e.preventDefault()
		if (columnDragIndex == null || columnDragIndex === toIndex) return
		onColumnReorder?.(columnDragIndex, toIndex)
		columnDragIndex = null
	}

	function setIndeterminate(node: HTMLInputElement, value: boolean) {
		node.indeterminate = value
		return {
			update(value: boolean) {
				node.indeterminate = value
			},
		}
	}
	function handleSortClick(colId: string) {
		if (!onSortChange) return
		if (sortColumnId !== colId) {
			onSortChange(colId, 'asc')
		} else if (sortDirection === 'asc') {
			onSortChange(colId, 'desc')
		} else {
			onSortChange('', 'asc')
		}
	}
</script>

<div
	class="overflow-x-auto rounded-lg border border-zinc-200 bg-white"
	onfocusin={handleTableFocusIn}
	onfocusout={handleTableFocusOut}
	role="none"
>
	<table class="min-w-full divide-y divide-zinc-200 text-left text-sm">
		<colgroup>
			{#if showSelectionColumn}
				<col style="width: 40px" />
			{/if}
			{#if onRowReorder}
				<col style="width: 40px" />
			{/if}
			{#each columns as col}
				<col
					style={col.width
						? `width: ${col.width}px; min-width: ${col.width}px; max-width: ${col.width}px;`
						: ''}
				/>
			{/each}
			{#if canDelete}
				<col style="width: 48px" />
			{:else if showAppendActions}
				<col style="width: 96px" />
			{/if}
		</colgroup>
		<thead class="bg-zinc-50">
			<tr>
				{#if showSelectionColumn}
					<th scope="col" class="w-10 px-2 py-3">
						<label class="flex cursor-pointer items-center justify-center">
							<input
								type="checkbox"
								checked={selectAllChecked}
								use:setIndeterminate={selectAllIndeterminate}
								aria-label="Select all rows"
								class="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
								onchange={() => {
									if (selectAllChecked) {
										onSelectedRowIdsChange?.(new Set())
									} else {
										onSelectedRowIdsChange?.(new Set(allRowIds))
									}
								}}
							/>
						</label>
					</th>
				{/if}
				{#if onRowReorder}
					<th scope="col" class="w-10 px-2 py-3" aria-label="Reorder"></th>
				{/if}
				{#each columns as col, colIndex}
					<th
						scope="col"
						use:registerHeader={col.id}
						class="relative px-4 py-3 font-medium text-zinc-700 {onSortChange
							? 'cursor-pointer select-none hover:bg-zinc-100'
							: ''}"
						role={onSortChange ? 'button' : undefined}
						tabindex={onSortChange ? 0 : undefined}
						onclick={() => onSortChange && handleSortClick(col.id)}
						onkeydown={(e) =>
							onSortChange &&
							(e.key === 'Enter' || e.key === ' ') &&
							(e.preventDefault(), handleSortClick(col.id))}
						ondragover={onColumnReorder
							? (e: DragEvent) => handleColumnDragOver(e, colIndex)
							: undefined}
						ondrop={onColumnReorder
							? (e: DragEvent) => handleColumnDrop(e, colIndex)
							: undefined}
					>
						<span class="flex items-center gap-1.5">
							{#if onColumnReorder}
								<span
									role="button"
									tabindex="0"
									class="cursor-grab touch-none text-zinc-400 active:cursor-grabbing"
									aria-label="Drag to reorder column"
									draggable="true"
									onclick={(e) => e.stopPropagation()}
									onkeydown={(e) => {
										e.stopPropagation()
										if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
									}}
									ondragstart={(e: DragEvent) => {
										e.stopPropagation()
										handleColumnDragStart(e, colIndex, col.name)
									}}
									ondragend={handleColumnDragEnd}
								>
									<svg
										class="h-3.5 w-3.5"
										fill="currentColor"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path
											d="M8 6h2v2H8V6zm0 5h2v2H8v-2zm0 5h2v2H8v-2zm5-10h2v2h-2V6zm0 5h2v2h-2v-2zm0 5h2v2h-2v-2z"
										/>
									</svg>
								</span>
							{/if}
							<span class="truncate">{col.name}</span>
							{#if onHeaderFilterClick}
								<button
									type="button"
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-zinc-200"
									aria-label={`Filter by ${col.name}`}
									onclick={(event) => {
										event.stopPropagation()
										onHeaderFilterClick?.(col.id)
									}}
								>
									<svg
										class="h-3.5 w-3.5 text-zinc-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M4 4h16l-6 7v5l-4 2v-7L4 4z"
										/>
									</svg>
								</button>
							{/if}
							{#if onSortChange}
								{#if sortColumnId === col.id}
									<span
										class="text-zinc-500"
										aria-label={sortDirection === 'asc'
											? 'Sorted ascending'
											: 'Sorted descending'}
									>
										{#if sortDirection === 'asc'}
											<svg
												class="h-4 w-4"
												fill="currentColor"
												viewBox="0 0 24 24"
												aria-hidden="true"
												><path d="M7 10l5 5 5-5H7z" /></svg
											>
										{:else}
											<svg
												class="h-4 w-4"
												fill="currentColor"
												viewBox="0 0 24 24"
												aria-hidden="true"
												><path d="M7 14l5-5 5 5H7z" /></svg
											>
										{/if}
									</span>
								{:else}
									<span class="text-zinc-400" aria-hidden="true">
										<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"
											><path d="M7 10l5 5 5-5H7z" /></svg
										>
									</span>
								{/if}
							{/if}
							{#if onColumnEdit}
								<button
									type="button"
									aria-label="Edit column"
									onclick={(e) => {
										e.stopPropagation()
										onColumnEdit(col)
									}}
									class="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
								>
									<svg
										class="h-3.5 w-3.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
										/>
									</svg>
								</button>
							{/if}
						</span>
						{#if permission === 'edit' && onColumnResize}
							<button
								type="button"
								class="absolute inset-y-0 right-0 w-1.5 cursor-col-resize bg-transparent select-none hover:bg-zinc-300"
								onmousedown={(event) => handleResizeMouseDown(event, col.id)}
								onclick={(event) => event.stopPropagation()}
								aria-label={`Resize column ${col.name}`}
							></button>
						{/if}
					</th>
				{/each}
				{#if canDelete}
					<th scope="col" class="w-12 px-2 py-3">
						{#if onAddColumn}
							<button
								type="button"
								aria-label="Add column"
								onclick={onAddColumn}
								class="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
							>
								<svg
									class="h-4 w-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 4v16m8-8H4"
									/>
								</svg>
							</button>
						{/if}
					</th>
				{:else if showAppendActions}
					<th scope="col" class="w-24 px-2 py-3" aria-label="Row actions"></th>
				{/if}
			</tr>
		</thead>
		<tbody class="divide-y divide-zinc-200">
			{#each rows as row, rowIndex (row.id)}
				<tr
					class="hover:bg-zinc-50/50"
					draggable={!!onRowReorder}
					role={onRowReorder ? 'button' : undefined}
					tabindex={onRowReorder ? 0 : undefined}
					ondragstart={(e) => onRowReorder && handleDragStart(e, rowIndex)}
					ondragend={handleDragEnd}
					ondragover={(e) => onRowReorder && handleDragOver(e, rowIndex)}
					ondrop={(e) => onRowReorder && handleDrop(e, rowIndex)}
				>
					{#if showSelectionColumn}
						<td class="w-10 px-2 py-2">
							<label class="flex cursor-pointer items-center justify-center">
								<input
									type="checkbox"
									checked={selectedRowIds!.has(row.id)}
									aria-label="Select row"
									class="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
									onchange={() => {
										const next = new Set(selectedRowIds)
										if (next.has(row.id)) next.delete(row.id)
										else next.add(row.id)
										onSelectedRowIdsChange?.(next)
									}}
								/>
							</label>
						</td>
					{/if}
					{#if onRowReorder}
						<td
							class="w-10 cursor-grab border-y-0 border-r-1 border-l-0 border-zinc-200 px-2 py-0 text-zinc-400 focus:border-zinc-400 active:cursor-grabbing"
						>
							<svg
								class="h-4 w-4"
								fill="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									d="M8 6h2v2H8V6zm0 5h2v2H8v-2zm0 5h2v2H8v-2zm5-10h2v2h-2V6zm0 5h2v2h-2v-2zm0 5h2v2h-2v-2z"
								/>
							</svg>
						</td>
					{/if}
					{#each columns as col}
						<td>
							{#if isRowEditable(row.id)}
								{#if col.type === 'boolean'}
									<label class="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											checked={isBooleanTrue(getCell(row.id, col.id))}
											onchange={(e) =>
												onCellChange(
													row.id,
													col.id,
													(e.target as HTMLInputElement).checked
														? 'true'
														: 'false'
												)}
											class="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
										/>
									</label>
								{:else}
									{@const spec = getInputSpec(col.type)}
									<input
										type={spec.type}
										step={spec.step}
										value={getInputValue(col, row.id)}
										oninput={(e) =>
											onCellChange(
												row.id,
												col.id,
												(e.target as HTMLInputElement).value
											)}
										class="w-full border-y-0 border-r-1 border-l-0 border-zinc-200 bg-white px-2 py-2.5 text-zinc-900 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 focus:outline-none"
									/>
								{/if}
							{:else}
								<span class="text-zinc-700">
									{#if col.type === 'boolean'}
										{isBooleanTrue(getCell(row.id, col.id)) ? 'Yes' : 'No'}
									{:else}
										{@const display = formatCellDisplay(
											col.type,
											getCell(row.id, col.id),
											col.format
										)}
										{#if display}
											<LinkifiedText text={display} class="text-zinc-700" />
										{:else}
											—
										{/if}
									{/if}
								</span>
							{/if}
						</td>
					{/each}
					{#if canDelete}
						<td class="px-2 py-2 text-center">
							<button
								type="button"
								aria-label="Delete row"
								onclick={() => onDeleteRow?.(row.id)}
								class="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
							>
								<svg
									class="h-4 w-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V7a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
									/>
								</svg>
							</button>
						</td>
					{:else if showAppendActions && isAppendEditableRow(row.id)}
						<td class="px-2 py-2">
							<div class="flex items-center gap-0.5">
								{#if isRowInEditMode(row.id)}
									<button
										type="button"
										aria-label="Done editing"
										onclick={() => onConfirmEdit?.(row.id)}
										class="rounded p-1 text-zinc-400 hover:bg-green-50 hover:text-green-600"
									>
										<svg
											class="h-4 w-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M5 13l4 4L19 7"
											/>
										</svg>
									</button>
									<button
										type="button"
										aria-label="Delete row"
										onclick={() => onDeleteRow?.(row.id)}
										class="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
									>
										<svg
											class="h-4 w-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
								{:else}
									<button
										type="button"
										aria-label="Edit row"
										onclick={() => onStartEdit?.(row.id)}
										class="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
									>
										<svg
											class="h-4 w-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
											/>
										</svg>
									</button>
								{/if}
							</div>
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
