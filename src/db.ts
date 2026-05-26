import { DuckDBInstance } from "@duckdb/node-api";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

function tracesDir(): string {
  return process.env.AUTOFN_TRACES_DIR ?? "./traces";
}

export async function openTraces() {
  const dir = tracesDir();
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No JSONL traces found in ${dir}`);
    }
    throw e;
  }
  if (files.length === 0) {
    throw new Error(`No JSONL traces found in ${dir}`);
  }
  const globPath = join(dir, "*.jsonl");

  const db = await DuckDBInstance.create(":memory:");
  const conn = await db.connect();
  // Escape single quotes per DuckDB's quoted-literal rules (' → '') so paths
  // containing single quotes (or operator-controlled env input) can't break
  // the view definition or inject DuckDB SQL.
  const safeGlob = globPath.replace(/'/g, "''");
  await conn.run(
    `CREATE OR REPLACE VIEW traces AS SELECT * FROM read_json_auto('${safeGlob}', format='nd', union_by_name=true)`
  );
  return { db, conn };
}

export async function summary() {
  const { conn } = await openTraces();
  const rows = await conn.runAndReadAll(`
    SELECT
      fn,
      variant,
      COALESCE(tier, '-') AS tier,
      COUNT(*) AS n,
      AVG(latencyMs) AS avgLatencyMs,
      SUM(CASE WHEN ok THEN 0 ELSE 1 END) AS errors
    FROM traces
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
  `);
  return rows.getRowObjects();
}
