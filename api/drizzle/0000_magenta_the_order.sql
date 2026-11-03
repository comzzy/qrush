CREATE TABLE `auth_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `indexer_state` (
	`id` text PRIMARY KEY NOT NULL,
	`last_block` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`invoice_key` text NOT NULL,
	`shop_id` text NOT NULL,
	`seller` text NOT NULL,
	`amount` text NOT NULL,
	`expires_at` integer NOT NULL,
	`max_uses` integer NOT NULL,
	`items` text NOT NULL,
	`memo` text,
	`signature` text,
	`status` text NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`viewer_latitude` real,
	`viewer_longitude` real,
	`viewer_country` text,
	`viewer_city` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_key_idx` ON `invoices` (`invoice_key`);--> statement-breakpoint
CREATE INDEX `invoices_shop_idx` ON `invoices` (`shop_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`receipt_id` integer PRIMARY KEY NOT NULL,
	`invoice_key` text NOT NULL,
	`seller` text NOT NULL,
	`buyer` text NOT NULL,
	`token_in` text NOT NULL,
	`amount_in` text NOT NULL,
	`gross_amount` text NOT NULL,
	`discount` text NOT NULL,
	`net_amount` text NOT NULL,
	`purchase_number` integer NOT NULL,
	`tx_hash` text NOT NULL,
	`block_number` integer NOT NULL,
	`log_index` integer NOT NULL,
	`block_timestamp` integer NOT NULL,
	`latitude` real,
	`longitude` real,
	`city` text,
	`country` text,
	`geo_source` text
);
--> statement-breakpoint
CREATE INDEX `payments_invoice_idx` ON `payments` (`invoice_key`);--> statement-breakpoint
CREATE INDEX `payments_seller_idx` ON `payments` (`seller`);--> statement-breakpoint
CREATE INDEX `payments_buyer_idx` ON `payments` (`buyer`);--> statement-breakpoint
CREATE TABLE `payouts` (
	`receipt_id` integer NOT NULL,
	`recipient` text NOT NULL,
	`amount` text NOT NULL,
	`log_index` integer NOT NULL,
	`tx_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payouts_tx_log_idx` ON `payouts` (`tx_hash`,`log_index`);--> statement-breakpoint
CREATE INDEX `payouts_receipt_idx` ON `payouts` (`receipt_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_usdc` text NOT NULL,
	`sku` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `products_shop_idx` ON `products` (`shop_id`);--> statement-breakpoint
CREATE TABLE `sellers` (
	`address` text PRIMARY KEY NOT NULL,
	`basename` text,
	`onchain_registered` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shops` (
	`id` text PRIMARY KEY NOT NULL,
	`seller` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`latitude` real,
	`longitude` real,
	`city` text,
	`country` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`seller`) REFERENCES `sellers`(`address`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shops_slug_idx` ON `shops` (`slug`);--> statement-breakpoint
CREATE INDEX `shops_seller_idx` ON `shops` (`seller`);