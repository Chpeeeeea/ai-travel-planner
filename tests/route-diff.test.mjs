import assert from "node:assert/strict";
import test from "node:test";
import { adjacentPairs, diffAdjacentRouteSegments } from "../platform/runtime/route-diff.mjs";

const segments = [
  { id: "route-ab", fromAssignmentId: "a", toAssignmentId: "b" },
  { id: "route-bc", fromAssignmentId: "b", toAssignmentId: "c" },
  { id: "route-cd", fromAssignmentId: "c", toAssignmentId: "d" },
];

test("builds only directed adjacent pairs", () => {
  assert.deepEqual(adjacentPairs(["a", "b", "c"]).map((pair) => pair.key), ["a->b", "b->c"]);
});

test("inserting a place preserves unaffected adjacent roads", () => {
  const diff = diffAdjacentRouteSegments(segments, ["a", "x", "b", "c", "d"]);
  assert.deepEqual(diff.invalid_segment_ids, ["route-ab"]);
  assert.deepEqual(diff.preserved_segment_ids, ["route-bc", "route-cd"]);
  assert.deepEqual(diff.missing_pairs.map((pair) => pair.key), ["a->x", "x->b"]);
});

test("removing a place invalidates only the two touching roads", () => {
  const diff = diffAdjacentRouteSegments(segments, ["a", "b", "d"]);
  assert.deepEqual(diff.invalid_segment_ids, ["route-bc", "route-cd"]);
  assert.deepEqual(diff.preserved_segment_ids, ["route-ab"]);
  assert.deepEqual(diff.missing_pairs.map((pair) => pair.key), ["b->d"]);
});

test("moving a place keeps any adjacency that remains directed and unchanged", () => {
  const diff = diffAdjacentRouteSegments(segments, ["a", "c", "b", "d"]);
  assert.deepEqual(diff.invalid_segment_ids.sort(), ["route-ab", "route-bc", "route-cd"]);
  assert.equal(diff.preserved_segment_ids.length, 0);
  assert.deepEqual(diff.missing_pairs.map((pair) => pair.key), ["a->c", "c->b", "b->d"]);
});
