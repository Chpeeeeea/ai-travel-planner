CREATE TABLE `provider_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`calls` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `planning_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_provider_usage_owner_created` ON `provider_usage_events` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_provider_usage_run_created` ON `provider_usage_events` (`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `trip_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `planning_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trip_share_links_token_unique` ON `trip_share_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_trip_share_links_run_status` ON `trip_share_links` (`run_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_trip_share_links_owner_created` ON `trip_share_links` (`owner_user_id`,`created_at`);