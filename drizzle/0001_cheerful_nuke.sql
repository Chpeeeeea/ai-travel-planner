ALTER TABLE `planning_runs` ADD `owner_user_id` text;--> statement-breakpoint
CREATE INDEX `idx_planning_runs_owner_updated` ON `planning_runs` (`owner_user_id`,`updated_at`);