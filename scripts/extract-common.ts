// Shared helpers for Phase 2 extract scripts.
// AST-parse vendor TS sources via ts-morph (no dynamic import per Session #8 D4).
// Writes deterministic JSON per Session #8 D5 (sorted keys + 2-space + \n).

import { writeFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import {
  Project,
  SyntaxKind,
  type Node,
  type ObjectLiteralExpression,
  type SourceFile,
} from "ts-morph"
import { ExtractionError } from "@/core/shared/errors"

/** Map of enum-member identifier → string value (e.g. { RESTORE: "restore" }). */
export type EnumMap = Record<string, string | number>

/** Recursively evaluate a ts-morph Node to a plain JS literal value.
 * Supports: strings, numbers, bools, null, arrays, objects, negation (-N),
 * type assertions (`x as Y`), parentheses, and enum-member property access
 * (e.g. `FeatureFocus.RESTORE`) resolved via the supplied enumMap.
 */
export function evalLiteralNode(node: Node, enums: Record<string, EnumMap> = {}): unknown {
  const sk = SyntaxKind

  switch (node.getKind()) {
    case sk.StringLiteral:
    case sk.NoSubstitutionTemplateLiteral:
      return (node as unknown as { getLiteralText(): string }).getLiteralText()
    case sk.NumericLiteral:
      return Number((node as unknown as { getLiteralText(): string }).getLiteralText())
    case sk.TrueKeyword:
      return true
    case sk.FalseKeyword:
      return false
    case sk.NullKeyword:
      return null
    case sk.PrefixUnaryExpression: {
      const n = node.asKindOrThrow(sk.PrefixUnaryExpression)
      const inner = evalLiteralNode(n.getOperand(), enums)
      if (n.getOperatorToken() === sk.MinusToken && typeof inner === "number") return -inner
      if (n.getOperatorToken() === sk.PlusToken && typeof inner === "number") return +inner
      throw new ExtractionError(`unsupported unary operator in literal: ${n.getText()}`)
    }
    case sk.ArrayLiteralExpression: {
      const arr = node.asKindOrThrow(sk.ArrayLiteralExpression)
      return arr.getElements().map((el) => evalLiteralNode(el, enums))
    }
    case sk.ObjectLiteralExpression:
      return evalObjectLiteral(node as ObjectLiteralExpression, enums)
    case sk.AsExpression:
    case sk.TypeAssertionExpression:
    case sk.SatisfiesExpression:
    case sk.ParenthesizedExpression: {
      const inner = (node as unknown as { getExpression(): Node }).getExpression()
      return evalLiteralNode(inner, enums)
    }
    case sk.PropertyAccessExpression: {
      const expr = node.asKindOrThrow(sk.PropertyAccessExpression)
      const owner = expr.getExpression().getText()
      const member = expr.getName()
      const table = enums[owner]
      if (!table || !(member in table)) {
        throw new ExtractionError(
          `unresolved property access '${owner}.${member}' — not in supplied enumMap`,
          { owner, member },
        )
      }
      return table[member]
    }
    default:
      throw new ExtractionError(
        `unsupported literal node kind: ${sk[node.getKind()]} (text: ${node.getText().slice(0, 80)})`,
      )
  }
}

function evalObjectLiteral(
  obj: ObjectLiteralExpression,
  enums: Record<string, EnumMap>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const prop of obj.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) {
      throw new ExtractionError(
        `unsupported object member kind: ${SyntaxKind[prop.getKind()]} (only plain PropertyAssignment)`,
      )
    }
    const pa = prop.asKindOrThrow(SyntaxKind.PropertyAssignment)
    const nameNode = pa.getNameNode()
    let key: string
    const nk = nameNode.getKind()
    if (nk === SyntaxKind.Identifier) key = nameNode.getText()
    else if (nk === SyntaxKind.StringLiteral || nk === SyntaxKind.NoSubstitutionTemplateLiteral) {
      key = (nameNode as unknown as { getLiteralText(): string }).getLiteralText()
    } else {
      throw new ExtractionError(`unsupported object key kind: ${SyntaxKind[nk]}`)
    }
    out[key] = evalLiteralNode(pa.getInitializerOrThrow(), enums)
  }
  return out
}

/** Read a TS `enum Foo { A = "a", B = "b" }` into a plain { A: "a", B: "b" } map. */
export function readEnumMap(sourceFile: SourceFile, enumName: string): EnumMap {
  const decl = sourceFile.getEnum(enumName)
  if (!decl) throw new ExtractionError(`enum '${enumName}' not found in ${sourceFile.getFilePath()}`)
  const out: EnumMap = {}
  for (const m of decl.getMembers()) {
    const init = m.getInitializer()
    if (!init) throw new ExtractionError(`enum '${enumName}.${m.getName()}' has no explicit initializer`)
    const value = evalLiteralNode(init)
    if (typeof value !== "string" && typeof value !== "number") {
      throw new ExtractionError(`enum '${enumName}.${m.getName()}' value must be string|number, got ${typeof value}`)
    }
    out[m.getName()] = value
  }
  return out
}

/** Find `export const NAME = <initializer>` and return the evaluated value. */
export function readExportedConst(
  sourceFile: SourceFile,
  name: string,
  enums: Record<string, EnumMap> = {},
): unknown {
  const decl = sourceFile.getVariableDeclaration(name)
  if (!decl) throw new ExtractionError(`exported const '${name}' not found in ${sourceFile.getFilePath()}`)
  const init = decl.getInitializer()
  if (!init) throw new ExtractionError(`exported const '${name}' has no initializer`)
  return evalLiteralNode(init, enums)
}

/** Load a ts-morph SourceFile for a single path. Isolated Project per call
 * (no shared state between extractors, keeps them independently testable). */
export function openSourceFile(path: string): SourceFile {
  const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true })
  return project.addSourceFileAtPath(path)
}

/** Recursively sort object keys (stable alphabetical). Arrays preserve order. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

/** Write `data` to `path` as deterministic JSON (sorted keys, 2-space indent, trailing \n). */
export function writeJsonDeterministic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const sorted = sortKeysDeep(data)
  writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n", "utf8")
}
