const { Pool } = require("pg");
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_BGjYqwE1T9Nt@ep-bold-frost-alt3rtij-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  max: 1,
});

async function main() {
  // List all tables
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log("=== Tables ===");
  for (const row of tables.rows) {
    console.log(`  ${row.table_name}`);
  }

  // For each table, show columns and sample rows
  for (const row of tables.rows) {
    const cols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = $1 ORDER BY ordinal_position
    `, [row.table_name]);
    console.log(`\n=== ${row.table_name} ===`);
    console.log("Columns:");
    for (const c of cols.rows) {
      console.log(`  ${c.column_name} (${c.data_type})`);
    }
    const sample = await pool.query(`SELECT * FROM ${row.table_name} LIMIT 3`);
    if (sample.rows.length > 0) {
      console.log("Sample rows:");
      for (const r of sample.rows) {
        console.log(`  ${JSON.stringify(r)}`);
      }
    }
  }

  await pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); process.exit(1); });
