import { DuckDBInstance } from "@duckdb/node-api";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

function tracesDir(): string {
  return process.env.AUTOFN_TRACES_DIR ?? "./traces";
}

export async function openTraces() {
  const dir = tracesDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    throw new Error(`No JSONL traces found in ${dir}`);
  }
  const globPath = join(dir, "*.jsonl");

  const db = await DuckDBInstance.create(":memory:");
  const conn = await db.connect();
  await conn.run(
    `CREATE OR REPLACE VIEW traces AS SELECT * FROM read_json_auto('${globPath}', format='nd', union_by_name=true)`
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
