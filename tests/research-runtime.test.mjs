import assert from "node:assert/strict";
import test from "node:test";
import {
  compileResearchEvidence,
  mergeResearchEvidence,
  normalizePlaceName,
} from "../platform/runtime/research.mjs";

function evidence(name, kind = "other", extras = {}) {
  return {
    lane: extras.lane ?? "culture",
    placeName: name,
    aliases: extras.aliases ?? [],
    themes: extras.themes ?? ["文化"],
    whyVisit: extras.whyVisit ?? `${name} 的研究理由`,
    watchFor: extras.watchFor ?? ["现场细节"],
    stayMinutes: extras.stayMinutes ?? 60,
    riskFlags: extras.riskFlags ?? [],
    sourceKind: kind,
    sourceTitle: extras.sourceTitle ?? `${name} 来源`,
    sourceUrl: extras.sourceUrl ?? `https://example.com/${encodeURIComponent(name)}`,
    sourceAuthority: extras.sourceAuthority,
  };
}

test("normalizes Chinese and Latin place-name punctuation consistently", () => {
  assert.equal(normalizePlaceName(" 青田·石雕博物馆（新馆） "), "青田石雕博物馆新馆");
  assert.equal(normalizePlaceName("Cafe-A_B"), "cafeab");
});

test("merges aliases transitively across research lanes", () => {
  const merged = mergeResearchEvidence([
    evidence("青田石雕博物馆", "official", { aliases: ["石雕博物馆"] }),
    evidence("石雕博物馆", "xiaohongshu", { aliases: ["青田石雕文化馆"] }),
    evidence("青田石雕文化馆", "local_media"),
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].canonicalName, "青田石雕博物馆");
  assert.equal(merged[0].evidenceCount, 3);
  assert.deepEqual(new Set(merged[0].aliases), new Set(["石雕博物馆", "青田石雕文化馆"]));
});

test("compiles a 20–40 name-level shortlist without provider entities", () => {
  const items = Array.from({ length: 45 }, (_, index) =>
    evidence(`候选地点${String(index + 1).padStart(2, "0")}`, index % 3 === 0 ? "official" : "xiaohongshu", {
      themes: index % 2 ? ["文化"] : ["文化", "风景"],
    }));
  const result = compileResearchEvidence({
    brief: { destination: "测试县", interests: ["文化", "风景"] },
    evidence: items,
    minimum: 20,
    maximum: 40,
  });
  assert.deepEqual(result.counts, { evidence: 45, deduplicated: 45, shortlisted: 40 });
  assert.equal(result.candidates.filter((candidate) => candidate.shortlistRank !== null).length, 40);
  assert.equal(result.providerPoiCalls, 0);
  assert.equal(result.providerRouteCalls, 0);
  for (const candidate of result.candidates) {
    assert.equal("providerPoiId" in candidate, false);
    assert.equal("location" in candidate, false);
    assert.equal("route" in candidate, false);
  }
});

test("ranks authoritative multi-source evidence above a single weak mention", () => {
  const result = compileResearchEvidence({
    brief: { interests: ["历史"] },
    evidence: [
      evidence("权威地点", "official", { themes: ["历史"], aliases: ["权威旧称"] }),
      evidence("权威旧称", "xiaohongshu", { themes: ["历史", "文化"] }),
      evidence("单一地点", "other", { themes: ["历史"] }),
    ],
    minimum: 1,
    maximum: 2,
  });
  assert.equal(result.candidates[0].canonicalName, "权威地点");
  assert.ok(result.candidates[0].score > result.candidates[1].score);
});

test("keeps an explicit warning instead of inventing candidates below target", () => {
  const result = compileResearchEvidence({
    brief: { interests: ["美食"] },
    evidence: [evidence("唯一地点", "official", { themes: ["美食"] })],
    minimum: 20,
    maximum: 40,
  });
  assert.equal(result.counts.shortlisted, 1);
  assert.match(result.warnings[0], /低于目标下限 20/);
});

test("promotes an evidenced must-visit place without bypassing POI verification", () => {
  const result = compileResearchEvidence({
    brief: { interests: ["风景"], must_visit: ["沈阳故宫"] },
    evidence: [
      evidence("热门公园", "official", { themes: ["风景"] }),
      evidence("沈阳故宫", "other", { themes: ["历史"], riskFlags: ["开放时间待核验"] }),
    ],
    minimum: 1,
    maximum: 1,
  });
  assert.equal(result.candidates[0].canonicalName, "沈阳故宫");
  assert.equal(result.candidates[0].userPriority, "must_visit");
  assert.equal(result.candidates[0].shortlistRank, 1);
  assert.equal("location" in result.candidates[0], false);
});

test("boosts candidates whose research evidence matches a must-eat item", () => {
  const result = compileResearchEvidence({
    brief: { interests: ["美食"], must_eat: ["锅包肉"] },
    evidence: [
      evidence("普通餐馆", "official", { themes: ["美食"] }),
      evidence("老字号饭店", "other", { themes: ["美食"], whyVisit: "招牌锅包肉值得专程尝试" }),
    ],
    minimum: 1,
    maximum: 2,
  });
  assert.equal(result.candidates[0].canonicalName, "老字号饭店");
  assert.equal(result.candidates[0].userPriority, "must_eat");
  assert.deepEqual(result.candidates[0].mustEatMatches, ["锅包肉"]);
});
