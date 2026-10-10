// Applies db/migrations/*.sql in filename order inside one transaction. Migrations are idempotent.
// Usage: npm run db:migrate (reads POSTGRES_URL or DATABASE_URL; use an administrative connection).
import postgres from "postgres";
import { readFile, readdir } from "node:fs/promises";

const connection = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connection) throw new Error("Set POSTGRES_URL or DATABASE_URL before running migrations.");
const host = new URL(connection).hostname;
const sql = postgres(connection, {
  max: 1,
  prepare: false,
  onnotice: () => {},
  ssl: ["localhost", "127.0.0.1", "[::1]", "postgres"].includes(host) || new URL(connection).searchParams.get("sslmode") === "disable" ? false : "require",
});
try {
  const directory = new URL("../db/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  await sql.begin(async (transaction) => {
    for (const file of files) await transaction.unsafe(await readFile(new URL(file, directory), "utf8"));
  });
  console.log(`Applied ${files.length} migration file(s).`);
} finally {
  await sql.end();
}
