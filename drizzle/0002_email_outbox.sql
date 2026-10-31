CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`project_id` text,
	`change_id` text,
	`review_token` text,
	`kind` text NOT NULL,
	`recipient` text NOT NULL,
	`subject` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'Queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt` integer,
	`next_attempt` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`provider_id` text,
	`error` text,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE INDEX `email_outbox_due` ON `email_outbox` (`status`,`next_attempt`);--> statement-breakpoint
CREATE INDEX `email_outbox_owner` ON `email_outbox` (`owner`,`created_at`);