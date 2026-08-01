import type { Metadata } from "next";
import { defaultTravelTopicLabels } from "../../platform/runtime/travel-topics.mjs";
import { requireChatGPTUser } from "../chatgpt-auth";
import TravelStudio from "./TravelStudio";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "旅行研究工作台 · AI Travel Planner",
  description: "创建并跟踪一次从多来源研究到真实道路地图的旅行规划任务。",
};

type SearchValue = string | string[] | undefined;

function first(value: SearchValue, fallback = "") {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function list(value: SearchValue, fallback: string[] = [], limit = 12) {
  const raw = first(value);
  return raw ? raw.split(",").map((item) => item.trim()).filter(Boolean).slice(0, limit) : fallback;
}

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const params = await searchParams;
  const returnQuery = new URLSearchParams();
  for (const key of ["destination", "days", "interests", "must_eat", "must_visit", "run_id"] as const) {
    const value = first(params[key]);
    if (value) returnQuery.set(key, value);
  }
  const returnTo = `/studio${returnQuery.size ? `?${returnQuery.toString()}` : ""}`;
  const user = await requireChatGPTUser(returnTo);
  return <TravelStudio
    user={{ displayName: user.displayName, email: user.email }}
    initialRunId={first(params.run_id)}
    initialBrief={{
      destination: first(params.destination, "青田县"),
      days: Math.max(1, Math.min(7, Number(first(params.days, "3")) || 3)),
      interests: list(params.interests, defaultTravelTopicLabels(), 8),
      mustEat: list(params.must_eat),
      mustVisit: list(params.must_visit),
    }}
  />;
}
