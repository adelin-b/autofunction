import "dotenv/config";
import { summary } from "../db.js";

async function main() {
  const rows = await summary();
  if (rows.length === 0) {
    console.log("(no traces yet)");
    return;
  }
  console.table(rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
