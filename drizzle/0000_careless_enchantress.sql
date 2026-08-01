CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`day_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`arrival_time` text,
	`departure_time` text,
	`locked` integer DEFAULT false NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`day_id`) REFERENCES `itinerary_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_assignments_day_order_unique` ON `assignments` (`day_id`,`order_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_assignments_day_candidate_unique` ON `assignments` (`day_id`,`candidate_id`);--> statement-breakpoint
CREATE TABLE `candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`canonical_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`themes_json` text DEFAULT '[]' NOT NULL,
	`why_visit` text DEFAULT '' NOT NULL,
	`watch_for_json` text DEFAULT '[]' NOT NULL,
	`risk_flags_json` text DEFAULT '[]' NOT NULL,
	`stay_minutes` integer DEFAULT 60 NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`shortlist_rank` integer,
	`verification_status` text DEFAULT 'candidate' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `planning_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_candidates_run_name_unique` ON `candidates` (`run_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `idx_candidates_run_rank` ON `candidates` (`run_id`,`shortlist_rank`);--> statement-breakpoint
CREATE INDEX `idx_candidates_run_verification` ON `candidates` (`run_id`,`verification_status`);--> statement-breakpoint
CREATE TABLE `itinerary_days` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`day_number` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`window_start` text DEFAULT '09:00' NOT NULL,
	`window_end` text DEFAULT '18:00' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `planning_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_itinerary_days_run_number_unique` ON `itinerary_days` (`run_id`,`day_number`);--> statement-breakpoint
CREATE TABLE `planning_briefs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`brief_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `planning_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `planning_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`status` text NOT NULL,
	`poi_calls` integer DEFAULT 0 NOT NULL,
	`route_calls` integer DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `planning_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_planning_run_events_run_created` ON `planning_run_events` (`run_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `planning_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`destination` text NOT NULL,
	`days` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_stage` text DEFAULT 'brief' NOT NULL,
	`input_hash` text NOT NULL,
	`source_policy_json` text NOT NULL,
	`candidate_min` integer DEFAULT 20 NOT NULL,
	`candidate_max` integer DEFAULT 40 NOT NULL,
	`daily_stops_min` integer DEFAULT 4 NOT NULL,
	`daily_stops_max` integer DEFAULT 6 NOT NULL,
	`provider_poi_calls` integer DEFAULT 0 NOT NULL,
	`provider_route_calls` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_planning_runs_status_updated` ON `planning_runs` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_planning_runs_destination_created` ON `planning_runs` (`destination`,`created_at`);--> statement-breakpoint
CREATE TABLE `provider_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_poi_id` text,
	`provider_name` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`typecode` text DEFAULT '' NOT NULL,
	`lng` real,
	`lat` real,
	`coordinate_system` text,
	`match_confidence` real,
	`status` text DEFAULT 'needs_confirmation' NOT NULL,
	`raw_json` text,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `planning_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_provider_matches_candidate` ON `provider_matches` (`candidate_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_provider_matches_provider_poi_unique` ON `provider_matches` (`run_id`,`provider`,`provider_poi_id`);--> statement-breakpoint
CREATE TABLE `research_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`lane` text NOT NULL,
	`place_name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`themes_json` text DEFAULT '[]' NOT NULL,
	`why_visit` text DEFAULT '' NOT NULL,
	`watch_for_json` text DEFAULT '[]' NOT NULL,
	`stay_minutes` integer DEFAULT 60 NOT NULL,
	`risk_flags_json` text DEFAULT '[]' NOT NULL,
	`source_kind` text NOT NULL,
	`source_title` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`source_authority` real DEFAULT 0.5 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `planning_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_research_evidence_run_lane` ON `research_evidence` (`run_id`,`lane`);--> statement-breakpoint
CREATE INDEX `idx_research_evidence_run_name` ON `research_evidence` (`run_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `route_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`day_id` text NOT NULL,
	`from_assignment_id` text NOT NULL,
	`to_assignment_id` text NOT NULL,
	`mode` text NOT NULL,
	`provider` text,
	`distance_m` integer,
	`duration_s` integer,
	`geometry_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`day_id`) REFERENCES `itinerary_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_route_segments_day_pair_unique` ON `route_segments` (`day_id`,`from_assignment_id`,`to_assignment_id`);--> statement-breakpoint
CREATE INDEX `idx_route_segments_day_status` ON `route_segments` (`day_id`,`status`);