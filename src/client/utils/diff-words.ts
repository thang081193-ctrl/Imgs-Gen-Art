// Phase 5 Step 5b (Session #27b) — word-level inline diff for PromptLab.
// Hand-rolled LCS + regex tokenizer (Q-5b.1 approved: `/(\s+|[.,!?;:]|
// [^\s.,!?;:]+)/g` grouping). Zero deps — diff output is a flat array of
// `equal | insert | delete` ops that DiffViewer renders with semantic
// `<del>` / `<ins>` elements + `+ / −` markers for colorblind a11y.
//
// Complexity is O(M×N) where M, N are token counts. For prompt-size inputs
// (typically < 500 tokens) this is imperceptible. If a user pastes an essay
// we'll profile and maybe swap for diff-match-patch, but that's future
// noise — bro said zero new deps for v1.

export type DiffOp = "equal" | "insert" | "delete"

export interface DiffPart {
  op: DiffOp
  text: string
}

const TOKENIZER = /(\s+|[.,!?;:]|[^\s.,!?;:]+)/g

export function tokenize(input: string): string[] {
  return input.match(TOKENIZER) ?? []
}

// Compute LCS table (rows = a tokens, cols = b tokens). Entry [i][j] = length
// of the longest common subsequence of a[0..i-1] and b[0..j-1].
function lcs(a: string[], b: string[]): number[][] {
  const rows = a.length + 1
  const cols = b.length + 1
  const table: number[][] = []
  for (let i = 0; i < rows; i++) {
    const row = new Array<number>(cols).fill(0)
    table.push(row)
  }
  for (let i = 1; i < rows; i++) {
    const aRow = table[i]
    const prevRow = table[i - 1]
    if (!aRow || !prevRow) continue
    for (let j = 1; j < cols; j++) {
      if (a[i - 1] === b[j - 1]) {
        aRow[j] = (prevRow[j - 1] ?? 0) + 1
      } else {
        aRow[j] = Math.max(prevRow[j] ?? 0, aRow[j - 1] ?? 0)
      }
    }
  }
  return table
}

// Walk the LCS table from (M, N) back to (0, 0) emitting ops in reverse, then
// flip + merge adjacent ops of the same kind so <del>/<ins> blocks stay
// chunky (fewer DOM nodes, more readable diff).
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before)
  const b = tokenize(after)
  const table = lcs(a, b)

  const reversed: DiffPart[] = []
  let i = a.length
  let j = b.length
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      reversed.push({ op: "equal", text: a[i - 1] ?? "" })
      i--
      j--
      continue
    }
    const up = table[i - 1]?.[j] ?? 0
    const left = table[i]?.[j - 1] ?? 0
    if (up >= left) {
      reversed.push({ op: "delete", text: a[i - 1] ?? "" })
      i--
    } else {
      reversed.push({ op: "insert", text: b[j - 1] ?? "" })
      j--
    }
  }
  while (i > 0) {
    reversed.push({ op: "delete", text: a[i - 1] ?? "" })
    i--
  }
  while (j > 0) {
    reversed.push({ op: "insert", text: b[j - 1] ?? "" })
    j--
  }

  const ops = reversed.reverse()
  return mergeAdjacent(ops)
}

function mergeAdjacent(parts: DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = []
  for (const part of parts) {
    const tail = merged[merged.length - 1]
    if (tail && tail.op === part.op) {
      tail.text += part.text
    } else {
      merged.push({ ...part })
    }
  }
  return merged
}
