import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const planningRuns = sqliteTable("planning_runs", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id"),
  destination: text("destination").notNull(),
  days: integer("days").notNull(),
  status: text("status").notNull().default("draft"),
  currentStage: text("current_stage").notNull().default("brief"),
  inputHash: text("input_hash").notNull(),
  sourcePolicyJson: text("source_policy_json").notNull(),
  candidateMin: integer("candidate_min").notNull().default(20),
  candidateMax: integer("candidate_max").notNull().default(40),
  dailyStopsMin: integer("daily_stops_min").notNull().default(4),
  dailyStopsMax: integer("daily_stops_max").notNull().default(6),
  providerPoiCalls: integer("provider_poi_calls").notNull().default(0),
  providerRouteCalls: integer("provider_route_calls").notNull().default(0),
  lastError: text("last_error"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_planning_runs_owner_updated").on(table.ownerUserId, table.updatedAt),
  index("idx_planning_runs_status_updated").on(table.status, table.updatedAt),
  index("idx_planning_runs_destination_created").on(table.destination, table.createdAt),
]);

export const planningBriefs = sqliteTable("planning_briefs", {
  runId: text("run_id").primaryKey().references(() => planningRuns.id, { onDelete: "cascade" }),
  briefJson: text("brief_json").notNull(),
  createdAt: createdAt(),
});

export const researchEvidence = sqliteTable("research_evidence", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => planningRuns.id, { onDelete: "cascade" }),
  lane: text("lane").notNull(),
  placeName: text("place_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  aliasesJson: text("aliases_json").notNull().default("[]"),
  themesJson: text("themes_json").notNull().default("[]"),
  whyVisit: text("why_visit").notNull().default(""),
  watchForJson: text("watch_for_json").notNull().default("[]"),
  stayMinutes: integer("stay_minutes").notNull().default(60),
  riskFlagsJson: text("risk_flags_json").notNull().default("[]"),
  sourceKind: text("source_kind").notNull(),
  sourceTitle: text("source_title").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  sourceAuthority: real("source_authority").notNull().default(0.5),
  createdAt: createdAt(),
}, (table) => [
  index("idx_research_evidence_run_lane").on(table.runId, table.lane),
  index("idx_research_evidence_run_name").on(table.runId, table.normalizedName),
]);

export const candidates = sqliteTable("candidates", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => planningRuns.id, { onDelete: "cascade" }),
  canonicalName: text("canonical_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  aliasesJson: text("aliases_json").notNull().default("[]"),
  themesJson: text("themes_json").notNull().default("[]"),
  whyVisit: text("why_visit").notNull().default(""),
  watchForJson: text("watch_for_json").notNull().default("[]"),
  riskFlagsJson: text("risk_flags_json").notNull().default("[]"),
  stayMinutes: integer("stay_minutes").notNull().default(60),
  score: real("score").notNull().default(0),
  evidenceCount: integer("evidence_count").notNull().default(0),
  shortlistRank: integer("shortlist_rank"),
  verificationStatus: text("verification_status").notNull().default("candidate"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_candidates_run_name_unique").on(table.runId, table.normalizedName),
  index("idx_candidates_run_rank").on(table.runId, table.shortlistRank),
  index("idx_candidates_run_verification").on(table.runId, table.verificationStatus),
]);

export const providerMatches = sqliteTable("provider_matches", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => planningRuns.id, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerPoiId: text("provider_poi_id"),
  providerName: text("provider_name").notNull().default(""),
  address: text("address").notNull().default(""),
  typecode: text("typecode").notNull().default(""),
  lng: real("lng"),
  lat: real("lat"),
  coordinateSystem: text("coordinate_system"),
  matchConfidence: real("match_confidence"),
  status: text("status").notNull().default("needs_confirmation"),
  rawJson: text("raw_json"),
  verifiedAt: text("verified_at"),
  createdAt: createdAt(),
}, (table) => [
  index("idx_provider_matches_candidate").on(table.candidateId),
  uniqueIndex("idx_provider_matches_provider_poi_unique").on(table.runId, table.provider, table.providerPoiId),
]);

export const itineraryDays = sqliteTable("itinerary_days", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => planningRuns.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  title: text("title").notNull().default(""),
  windowStart: text("window_start").notNull().default("09:00"),
  windowEnd: text("window_end").notNull().default("18:00"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("idx_itinerary_days_run_number_unique").on(table.runId, table.dayNumber),
]);

export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey(),
  dayId: text("day_id").notNull().references(() => itineraryDays.id, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "restrict" }),
  orderIndex: integer("order_index").notNull(),
  arrivalTime: text("arrival_time"),
  departureTime: text("departure_time"),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("idx_assignments_day_order_unique").on(table.dayId, table.orderIndex),
  uniqueIndex("idx_assignments_day_candidate_unique").on(table.dayId, table.candidateId),
]);

export const routeSegments = sqliteTable("route_segments", {
  id: text("id").primaryKey(),
  dayId: text("day_id").notNull().references(() => itineraryDays.id, { onDelete: "cascade" }),
  fromAssignmentId: text("from_assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
  toAssignmentId: text("to_assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  provider: text("provider"),
  distanceM: integer("distance_m"),
  durationS: integer("duration_s"),
  geometryJson: text("geometry_json"),
  status: text("status").notNull().default("pending"),
  verifiedAt: text("verified_at"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("idx_route_segments_day_pair_unique").on(table.dayId, table.fromAssignmentId, table.toAssignmentId),
  index("idx_route_segments_day_status").on(table.dayId, table.status),
]);

export const planningRunEvents = sqliteTable("planning_run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => planningRuns.id, { onDelete: "cascade" }),
  fromStage: text("from_stage"),
  toStage: text("to_stage").notNull(),
  status: text("status").notNull(),
  poiCalls: integer("poi_calls").notNull().default(0),
  routeCalls: integer("route_calls").notNull().default(0),
  message: text("message").notNull().default(""),
  createdAt: createdAt(),
}, (table) => [
  index("idx_planning_run_events_run_created").on(table.runId, table.createdAt),
]);
