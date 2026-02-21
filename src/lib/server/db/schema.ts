import {
	integer,
	sqliteTable,
	text,
	primaryKey,
} from 'drizzle-orm/sqlite-core';

export const columnTypes = [
	'string',
	'number',
	'date',
	'datetime',
	'currency',
	'boolean',
] as const;
export type ColumnType = (typeof columnTypes)[number];

export const permissions = ['read', 'append', 'edit'] as const;
export type Permission = (typeof permissions)[number];

export const sheets = sqliteTable('sheets', {
	id: text('id').primaryKey(),
	name: text('name'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

/** Column display format (stored as JSON). Does not affect stored values or sorting. */
export type ColumnFormat = {
	currencySymbol?: string;
	decimalPlaces?: number;
	thousandsSeparator?: boolean;
};

export const columns = sqliteTable('columns', {
	id: text('id').primaryKey(),
	sheetId: text('sheet_id')
		.notNull()
		.references(() => sheets.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	type: text('type', { enum: columnTypes }).notNull().default('string'),
	order: integer('order').notNull().default(0),
	/** JSON: { currencySymbol?, decimalPlaces?, thousandsSeparator? } */
	format: text('format'),
});

export const rows = sqliteTable('rows', {
	id: text('id').primaryKey(),
	sheetId: text('sheet_id')
		.notNull()
		.references(() => sheets.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	/** Display order: admin-defined or CSV import order. Lower = first. */
	orderNum: integer('order_num').notNull().default(0),
	/** When set, row was added via a share link with append; only that token can edit its cells. */
	createdByToken: text('created_by_token'),
});

export const cells = sqliteTable(
	'cells',
	{
		rowId: text('row_id')
			.notNull()
			.references(() => rows.id, { onDelete: 'cascade' }),
		columnId: text('column_id')
			.notNull()
			.references(() => columns.id, { onDelete: 'cascade' }),
		value: text('value').notNull().default(''),
	},
	(table) => [primaryKey({ columns: [table.rowId, table.columnId] })]
);

export const shareLinks = sqliteTable('share_links', {
	id: text('id').primaryKey(),
	sheetId: text('sheet_id')
		.notNull()
		.references(() => sheets.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	permission: text('permission', { enum: permissions }).notNull(),
});
