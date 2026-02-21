/**
 * Display formatting for column values. Used only for display; does not affect
 * stored values or sorting.
 */
export type ColumnFormat = {
	currencySymbol?: string;
	decimalPlaces?: number;
	thousandsSeparator?: boolean;
};

function formatNumberForDisplay(
	value: string,
	opts: { decimalPlaces?: number; thousandsSeparator?: boolean; prefix?: string; suffix?: string }
): string {
	const trimmed = value.trim();
	if (trimmed === '') return '';
	const num = Number(trimmed);
	if (Number.isNaN(num)) return value;
	const decimals = opts.decimalPlaces ?? (Number.isInteger(num) ? 0 : 2);
	const parts = num.toFixed(decimals).split('.');
	if (opts.thousandsSeparator && parts[0].length > 3) {
		parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}
	const formatted = parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0];
	const prefix = opts.prefix ?? '';
	const suffix = opts.suffix ?? '';
	return `${prefix}${formatted}${suffix}`;
}

/**
 * Returns a display string for a cell value based on column type and optional format.
 * Raw value is unchanged for storage and sorting.
 */
export function formatCellDisplay(
	columnType: string,
	value: string,
	format?: ColumnFormat | null
): string {
	const trimmed = value.trim();
	if (trimmed === '') return '';

	switch (columnType) {
		case 'number':
			return formatNumberForDisplay(value, {
				decimalPlaces: format?.decimalPlaces,
				thousandsSeparator: format?.thousandsSeparator
			});
		case 'currency': {
			const symbol = format?.currencySymbol ?? '';
			return formatNumberForDisplay(value, {
				decimalPlaces: format?.decimalPlaces ?? 2,
				thousandsSeparator: format?.thousandsSeparator ?? true,
				prefix: symbol ? `${symbol} ` : ''
			});
		}
		default:
			return value;
	}
}
