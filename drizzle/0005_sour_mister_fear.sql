ALTER TABLE `planning_runs` ADD `archived_at` text;--> statement-breakpoint
CREATE INDEX `idx_planning_runs_owner_archived_updated` ON `planning_runs` (`owner_user_id`,`archived_at`,`updated_at`);