const { Pool } = require('pg');

async function test() {
  const pool = new Pool({
    connectionString: 'postgresql://neondb_owner:npg_BGjYqwE1T9Nt@ep-bold-frost-alt3rtij-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full',
    max: 1,
  });

  // Get active nodes
  const nodesResult = await pool.query(
    'SELECT id, node_code, name, location_name, crop FROM nodes WHERE active = true'
  );
  console.log('Active nodes:', JSON.stringify(nodesResult.rows, null, 2));

  if (nodesResult.rows.length > 0) {
    const nodeIds = nodesResult.rows.map(r => r.id);
    
    // Get latest readings for each node
    const readingsResult = await pool.query(
      `SELECT DISTINCT ON (node_id)
        node_id, measured_at, air_temp_c, air_humidity_pct, 
        pressure_hpa, leaf_temp_c, soil_moisture_pct, 
        battery_v, rssi_dbm
      FROM sensor_readings
      WHERE node_id = ANY($1)
      ORDER BY node_id, measured_at DESC`,
      [nodeIds]
    );
    console.log('Latest readings:', JSON.stringify(readingsResult.rows, null, 2));
  }

  await pool.end();
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
