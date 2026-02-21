export const columnTypes = [
	'string',
	'number',
	'date',
	'datetime',
	'currency',
	'boolean'
] as const;
export type ColumnType = (typeof columnTypes)[number];

export const permissions = ['read', 'append', 'edit'] as const;
export type Permission = (typeof permissions)[number];
