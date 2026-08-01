import { MAX_SELECTED_TRAVEL_TOPICS } from "./travel-topics.mjs";

function cleanStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value).trim().slice(0, 80)).filter(Boolean))].slice(0, 12);
}

function validTime(value, fallback) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? "")) ? String(value) : fallback;
}

export function normalizeBrief(input = {}) {
  const destination = String(input.destination ?? "").trim();
  const days = Number(input.days);
  if (!destination || destination.length > 80) throw new Error("destination must be 1–80 characters");
  if (!Number.isInteger(days) || days < 1 || days > 14) throw new Error("days must be an integer between 1 and 14");
  const candidateMin = Math.max(20, Math.min(40, Number(input.candidate_target?.min ?? 20)));
  const candidateMax = Math.max(candidateMin, Math.min(40, Number(input.candidate_target?.max ?? 40)));
  const dailyStopsMin = Math.max(4, Math.min(6, Number(input.daily_stops?.min ?? 4)));
  const dailyStopsMax = Math.max(dailyStopsMin, Math.min(6, Number(input.daily_stops?.max ?? 6)));
  const transportMode = ["walking", "driving", "bicycling", "mixed"].includes(String(input.transport_mode))
    ? String(input.transport_mode)
    : "mixed";
  const sourcePolicy = cleanStrings(input.source_policy);
  return {
    destination,
    days,
    interests: cleanStrings(input.interests).slice(0, MAX_SELECTED_TRAVEL_TOPICS),
    must_eat: cleanStrings(input.must_eat),
    must_visit: cleanStrings(input.must_visit),
    pace: String(input.pace || "moderate").slice(0, 30),
    transport_mode: transportMode,
    daily_window: {
      start: validTime(input.daily_window?.start, "09:00"),
      end: validTime(input.daily_window?.end, "18:00"),
    },
    source_policy: sourcePolicy.length ? sourcePolicy : ["official", "xiaohongshu", "osm", "multi_topic_research"],
    candidate_target: { min: candidateMin, max: candidateMax },
    daily_stops: { min: dailyStopsMin, max: dailyStopsMax },
  };
}
