// lib/dante/diff.ts
//
// Word-level LCS diff for the DraftEditor's "Show edits" toggle.
// Returns an ordered list of segments classified as same / added /
// removed so the renderer can render strikethrough deletions and
// highlighted additions inline — the Harvey "Show Edits" pattern.
//
// Tokenization keeps whitespace as separate tokens (so the diff
// preserves spacing on reassembly) and treats punctuation as part of
// the surrounding word (so "policy." and "policy" diff as the same
// stem with different trailing tokens, which reads cleaner than
// splitting punctuation into its own runs).
//
// Memory cap: LCS is O(n*m). For drafts above ~3,000 tokens we
// degrade to a coarser line-level diff; gold-standard email drafts
// almost never hit that ceiling.

export type DiffOp = {
  type: "same" | "added" | "removed";
  text: string;
};

const MAX_LCS_TOKENS = 3000;

function tokenize(text: string): string[] {
  // Whitespace runs and non-whitespace runs alternate.
  return text.match(/\S+|\s+/g) || [];
}

export function diffWords(prev: string, next: string): DiffOp[] {
  if (prev === next) {
    return prev.length > 0 ? [{ type: "same", text: prev }] : [];
  }
  const a = tokenize(prev);
  const b = tokenize(next);

  // Coarse fallback for very long drafts — line-level instead of word-
  // level. Cheap LCS over fewer tokens, still useful diff in the rare
  // case the user's prompting D/V to revise a 5,000-word memo.
  if (a.length > MAX_LCS_TOKENS || b.length > MAX_LCS_TOKENS) {
    return diffLines(prev, next);
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Walk back to produce ops in reverse, then unshift to fix order.
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ type: "same", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: "added", text: b[j - 1] });
      j--;
    } else {
      ops.unshift({ type: "removed", text: a[i - 1] });
      i--;
    }
  }

  // Coalesce adjacent same-type runs so the rendered output isn't
  // 100 spans of single tokens.
  return coalesce(ops);
}

function diffLines(prev: string, next: string): DiffOp[] {
  const a = prev.split(/(\n)/);
  const b = next.split(/(\n)/);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ type: "same", text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: "added", text: b[j - 1] });
      j--;
    } else {
      ops.unshift({ type: "removed", text: a[i - 1] });
      i--;
    }
  }
  return coalesce(ops);
}

function coalesce(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else out.push({ ...op });
  }
  return out;
}

/** Quick statistics on a diff — useful for "12 additions, 3 deletions"
 *  summaries in revision history. Counts are token-level, not
 *  character-level, so they read like word-counts. */
export function diffStats(ops: DiffOp[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === "same") continue;
    const tokens = (op.text.match(/\S+/g) || []).length;
    if (op.type === "added") added += tokens;
    else removed += tokens;
  }
  return { added, removed };
}
