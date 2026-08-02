export function adjacentPairKey(fromAssignmentId, toAssignmentId) {
  return `${fromAssignmentId}->${toAssignmentId}`;
}

export function adjacentPairs(assignmentIds) {
  const pairs = [];
  for (let index = 0; index < assignmentIds.length - 1; index += 1) {
    pairs.push({
      from_assignment_id: assignmentIds[index],
      to_assignment_id: assignmentIds[index + 1],
      key: adjacentPairKey(assignmentIds[index], assignmentIds[index + 1]),
    });
  }
  return pairs;
}

export function diffAdjacentRouteSegments(existingSegments, nextAssignmentIds) {
  const nextPairs = adjacentPairs(nextAssignmentIds);
  const nextKeys = new Set(nextPairs.map((pair) => pair.key));
  const existingByKey = new Map(existingSegments.map((segment) => [
    adjacentPairKey(segment.fromAssignmentId, segment.toAssignmentId),
    segment,
  ]));
  return {
    invalid_segment_ids: existingSegments
      .filter((segment) => !nextKeys.has(adjacentPairKey(segment.fromAssignmentId, segment.toAssignmentId)))
      .map((segment) => segment.id),
    preserved_segment_ids: existingSegments
      .filter((segment) => nextKeys.has(adjacentPairKey(segment.fromAssignmentId, segment.toAssignmentId)))
      .map((segment) => segment.id),
    missing_pairs: nextPairs.filter((pair) => !existingByKey.has(pair.key)),
  };
}
