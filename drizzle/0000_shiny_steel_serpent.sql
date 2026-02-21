CREATE TABLE `cells` (
	`row_id` text NOT NULL,
	`column_id` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`row_id`, `column_id`),
	FOREIGN KEY (`row_id`) REFERENCES `rows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`column_id`) REFERENCES `columns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `columns` (
	`id` text PRIMARY KEY NOT NULL,
	`sheet_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'string' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`sheet_id`) REFERENCES `sheets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rows` (
	`id` text PRIMARY KEY NOT NULL,
	`sheet_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sheet_id`) REFERENCES `sheets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`sheet_id` text NOT NULL,
	`token` text NOT NULL,
	`permission` text NOT NULL,
	FOREIGN KEY (`sheet_id`) REFERENCES `sheets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_links_token_unique` ON `share_links` (`token`);--> statement-breakpoint
CREATE TABLE `sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`created_at` integer NOT NULL
);
