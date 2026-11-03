CREATE TABLE `downloads` (
	`tx_hash` text NOT NULL,
	`product_id` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`stamped_pathname` text,
	`last_at` integer,
	PRIMARY KEY(`tx_hash`, `product_id`)
);
--> statement-breakpoint
CREATE TABLE `file_fingerprints` (
	`sha256` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`product_id` text NOT NULL,
	`seller` text NOT NULL,
	`file_name` text,
	`first_uploaded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`invoice_key` text NOT NULL,
	`seller` text NOT NULL,
	`fulfilment` text NOT NULL,
	`status` text NOT NULL,
	`tracking` text,
	`seller_note` text,
	`address` text,
	`schedule` text,
	`name` text,
	`email` text,
	`phone` text,
	`note` text,
	`tx_hash` text,
	`receipt_id` integer,
	`buyer` text,
	`created_at` integer NOT NULL,
	`confirmed_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_tx_idx` ON `orders` (`tx_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_code_idx` ON `orders` (`code`);--> statement-breakpoint
CREATE INDEX `orders_invoice_idx` ON `orders` (`invoice_key`);--> statement-breakpoint
CREATE INDEX `orders_seller_idx` ON `orders` (`seller`);--> statement-breakpoint
CREATE TABLE `product_deliveries` (
	`product_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`pathname` text,
	`url` text,
	`file_name` text,
	`size` integer,
	`content_type` text,
	`sha256` text,
	`rights_confirmed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_key` text NOT NULL,
	`seller` text NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`contact` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `product_reports_seller_idx` ON `product_reports` (`seller`);--> statement-breakpoint
ALTER TABLE `products` ADD `buyer_fields` text;--> statement-breakpoint
ALTER TABLE `products` ADD `fulfilment` text;--> statement-breakpoint
ALTER TABLE `shops` ADD `buyer_fields` text;