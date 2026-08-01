CREATE TABLE `research_lane_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`lane` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`artifact_markdown` text DEFAULT '' NOT NULL,
	`last_error` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `planning_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_lane_jobs_run_lane_unique` ON `research_lane_jobs` (`run_id`,`lane`);--> statement-breakpoint
CREATE INDEX `idx_research_lane_jobs_run_status` ON `research_lane_jobs` (`run_id`,`status`);--> statement-breakpoint
ALTER TABLE `planning_runs` ADD `worker_attempt` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `planning_runs` ADD `worker_version` text;--> statement-breakpoint
ALTER TABLE `planning_runs` ADD `lease_owner` text;--> statement-breakpoint
ALTER TABLE `planning_runs` ADD `lease_token_hash` text;--> statement-breakpoint
ALTER TABLE `planning_runs` ADD `lease_expires_at` text;--> statement-breakpoint
CREATE INDEX `idx_planning_runs_lease_stage` ON `planning_runs` (`lease_expires_at`,`current_stage`,`updated_at`);