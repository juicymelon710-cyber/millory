require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { getDb } = require("../server/db");

async function main() {
  const schemaPath = path.join(__dirname, "..", "server", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

  const db = getDb();
  await db.executeMultiple(schema);

  // Columns added after the initial schema. ALTER TABLE ADD COLUMN has no
  // "IF NOT EXISTS" in SQLite/libSQL, so each is attempted individually and
  // a "duplicate column" failure (already applied) is ignored - safe to re-run.
  const columnMigrations = [
    "ALTER TABLE products ADD COLUMN small_coefficient REAL NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN medium_coefficient REAL NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN big_coefficient REAL NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN medium_size INTEGER",
    "ALTER TABLE products ADD COLUMN big_size INTEGER",
    "ALTER TABLE products ADD COLUMN deleted_at TEXT DEFAULT NULL"
  ];
  for (const sql of columnMigrations) {
    try {
      await db.execute(sql);
      console.log(`Aplicat: ${sql}`);
    } catch (error) {
      if (!/duplicate column/i.test(error.message)) throw error;
    }
  }

  await db.execute("CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at)");

  const tables = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  console.log("Tabele create in Turso:");
  tables.rows.forEach((row) => console.log(`  - ${row.name}`));
}

main().catch((error) => {
  console.error("Migrarea a esuat:", error.message);
  process.exit(1);
});
