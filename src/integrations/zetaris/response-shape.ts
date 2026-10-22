import type { RawRow } from "./rows";
import { ZetarisResponseShapeUnsupportedError } from "./errors";

/**
 * Explicit response-normalization boundary for POST /sql-editor/sqls/run.
 *
 * The hackathon guide's smoke example reads `data[0][0]`, so the endpoint can
 * return POSITIONAL rows (arrays) as well as object rows. Which one a given
 * Zetaris environment returns is not proven until a live call, so the family is
 * classified explicitly and reported.
 *
 * Column metadata: NO metadata field for this endpoint is documented in any
 * source available to this repository (the generic Zetaris OpenAPI spec does
 * not describe /sql-editor/sqls/run at all). None is assumed or implemented:
 * positional rows therefore always raise ZetarisResponseShapeUnsupportedError
 * rather than being mapped by guessed column order. When a live response shows
 * a real metadata field, add it to `resolveColumnNames` (and a test) here.
 */
export type ZetarisResponseFamily =
  "OBJECT_ROWS" | "POSITIONAL_ROWS" | "EMPTY" | "MIXED_ROWS" | "UNRECOGNIZED";

export interface ZetarisResponseShape {
  family: ZetarisResponseFamily;
  /** JS type of `data`: "array" | "object" | "string" | "number" | "boolean" | "null" | "undefined". */
  dataType: string;
  rowCount: number | null;
  /** Number of cells in the first positional row; null for other families. */
  firstRowWidth: number | null;
  /** Names of top-level response keys only (never values). */
  topLevelKeys: string[];
  /** Always "NONE_RECOGNIZED" until a documented metadata shape exists. */
  columnMetadata: "NONE_RECOGNIZED";
}

const SAFE_KEY = /^[A-Za-z0-9_.-]{1,40}$/;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function classifyZetarisResponse(body: unknown): ZetarisResponseShape {
  const topLevelKeys = isRecord(body)
    ? Object.keys(body)
        .filter((k) => SAFE_KEY.test(k))
        .sort()
        .slice(0, 20)
    : [];
  const data = isRecord(body) ? body.data : undefined;
  const dataType = data === null ? "null" : Array.isArray(data) ? "array" : typeof data;
  const base = { dataType, topLevelKeys, columnMetadata: "NONE_RECOGNIZED" as const };

  if (!Array.isArray(data)) {
    return { ...base, family: "UNRECOGNIZED", rowCount: null, firstRowWidth: null };
  }
  if (data.length === 0) return { ...base, family: "EMPTY", rowCount: 0, firstRowWidth: null };
  if (data.every(isRecord)) {
    return { ...base, family: "OBJECT_ROWS", rowCount: data.length, firstRowWidth: null };
  }
  if (data.every((r) => Array.isArray(r))) {
    return {
      ...base,
      family: "POSITIONAL_ROWS",
      rowCount: data.length,
      firstRowWidth: (data[0] as unknown[]).length,
    };
  }
  const mixed = data.some(isRecord) && data.some((r) => Array.isArray(r));
  return {
    ...base,
    family: mixed ? "MIXED_ROWS" : "UNRECOGNIZED",
    rowCount: data.length,
    firstRowWidth: null,
  };
}

/** Reads column names for positional rows from one DOCUMENTED metadata shape; null when absent. */
type ColumnMetadataReader = (body: Record<string, unknown>) => string[] | null;

/**
 * Evidenced metadata shapes. EMPTY ON PURPOSE: no source available to this
 * repository documents a column-metadata field for /sql-editor/sqls/run, and
 * inventing one would risk mis-normalizing truth. Add a reader here (plus a
 * normalization test) only after a live response or official doc shows one.
 */
const DOCUMENTED_COLUMN_METADATA_READERS: readonly ColumnMetadataReader[] = [];

/** Names of the columns for positional rows, or null if no documented metadata identifies them. */
export function resolveColumnNames(body: unknown): string[] | null {
  if (!isRecord(body)) return null;
  for (const read of DOCUMENTED_COLUMN_METADATA_READERS) {
    const columns = read(body);
    if (columns !== null) return columns;
  }
  return null;
}

/** Turns a response body into object rows, or fails loudly with safe shape information. */
export function extractRows(
  body: unknown,
  context: { httpStatus: number; requestId: string },
): { rows: RawRow[]; shape: ZetarisResponseShape } {
  const shape = classifyZetarisResponse(body);
  if (shape.family === "OBJECT_ROWS") {
    return { rows: (body as { data: RawRow[] }).data, shape };
  }
  if (shape.family === "EMPTY") return { rows: [], shape };
  if (shape.family === "POSITIONAL_ROWS") {
    const columns = resolveColumnNames(body);
    if (columns !== null) {
      const rows = (body as { data: unknown[][] }).data;
      if (rows.every((r) => r.length === columns.length)) {
        return {
          rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))),
          shape,
        };
      }
    }
  }
  throw new ZetarisResponseShapeUnsupportedError(shape, context.httpStatus, context.requestId);
}
