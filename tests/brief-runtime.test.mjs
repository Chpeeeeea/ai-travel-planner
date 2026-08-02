import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrief } from "../platform/runtime/brief.mjs";
import { MAX_SELECTED_TRAVEL_TOPICS, TRAVEL_TOPIC_GROUPS, TRAVEL_TOPICS, topicsForInterests } from "../platform/runtime/travel-topics.mjs";

test("normalizes a traveler brief into the platform contract", () => {
  const brief = normalizeBrief({
    destination: " 青田县 ",
    days: 3,
    interests: ["美食", "风景", "美食"],
    must_eat: ["田鱼", "田鱼"],
    must_visit: ["石门洞"],
    candidate_target: { min: 5, max: 99 },
    daily_stops: { min: 2, max: 9 },
  });
  assert.equal(brief.destination, "青田县");
  assert.deepEqual(brief.interests, ["美食", "风景"]);
  assert.deepEqual(brief.must_eat, ["田鱼"]);
  assert.deepEqual(brief.must_visit, ["石门洞"]);
  assert.deepEqual(brief.candidate_target, { min: 20, max: 40 });
  assert.deepEqual(brief.daily_stops, { min: 4, max: 6 });
  assert.equal(brief.transport_mode, "mixed");
});

test("rejects an invalid destination or duration", () => {
  assert.throws(() => normalizeBrief({ destination: "", days: 3 }), /destination/);
  assert.throws(() => normalizeBrief({ destination: "青田", days: 0 }), /days/);
});

test("maps a broad user-selected travel topic catalog into bounded research lanes", () => {
  assert.equal(TRAVEL_TOPICS.length, 38);
  assert.deepEqual(TRAVEL_TOPIC_GROUPS.map((group) => group.id), ["humanities", "nature", "lifestyle", "entertainment", "travel_style"]);
  assert.ok(TRAVEL_TOPIC_GROUPS.every((group) => TRAVEL_TOPICS.some((topic) => topic.group === group.id)));
  const selected = topicsForInterests(["历史", "博物馆", "建筑", "夜游", "摄影", "亲子", "户外", "温泉", "咖啡庄园"]);
  assert.equal(selected.length, MAX_SELECTED_TRAVEL_TOPICS);
  assert.deepEqual(selected.slice(0, 4).map((topic) => topic.id), ["history", "museums", "architecture", "nightlife"]);
  assert.deepEqual(topicsForInterests([]).map((topic) => topic.id), ["history", "culture", "scenery", "food"]);
  assert.equal(topicsForInterests(["咖啡庄园"])[0].id, "special_interest");
});

test("maps new specialist interests to their dedicated research lanes", () => {
  assert.deepEqual(
    topicsForInterests(["观鸟", "菜场", "音乐会", "自驾", "宠物友好", "工业遗产"]).map((topic) => topic.id),
    ["wildlife", "markets", "performance", "roadtrip", "pet", "industrial"],
  );
});
