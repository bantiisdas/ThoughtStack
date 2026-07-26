/**
 * Reciprocal Rank Fusion over ranked lists of document ids.
 * score(d) = Σ 1 / (k + rank_r(d))  with k=60 (standard).
 */
export function reciprocalRankFusion(
  rankedLists: string[][],
  options?: { k?: number; topN?: number },
): string[] {
  const k = options?.k ?? 60;
  const topN = options?.topN ?? 5;
  const scores = new Map<string, number>();

  for (const list of rankedLists) {
    list.forEach((id, index) => {
      const rank = index + 1;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id);
}
