CREATE TABLE `email_daily_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`hits` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gmail_connections` (
	`owner` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`status` text NOT NULL,
	`connected_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `email_outbox` ADD `provider` text DEFAULT 'resend' NOT NULL;