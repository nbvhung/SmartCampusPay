require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const connection = new Client({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASS || 'postgres', database: process.env.DB_NAME || 'smartcampuspay' });
(async () => {
  await connection.connect();
  try {
    const money = await connection.query('SELECT count(*)::int AS count FROM accounts WHERE balance < 0 OR "dailySpent" < 0 OR "dailyLimit" < 0');
    const tx = await connection.query('SELECT count(*)::int AS count FROM transactions WHERE amount < 0');
    const uid = await connection.query(`SELECT count(*)::int AS count FROM (
      SELECT CASE WHEN upper(trim(uid)) LIKE 'MOCK-%' THEN upper(trim(uid)) ELSE regexp_replace(upper(trim(uid)), '[[:space:]:-]', '', 'g') END AS normalized
      FROM cards GROUP BY normalized HAVING count(*) > 1) collisions`);
    const counts = { invalidWallets: money.rows[0].count, invalidTransactions: tx.rows[0].count, uidCollisions: uid.rows[0].count };
    console.log(JSON.stringify(counts));
    if (Object.values(counts).some(count => count > 0)) process.exitCode = 1;
  } finally { await connection.end(); }
})().catch(error => { console.error(`Preflight failed: ${error.code || error.name}`); process.exitCode = 1; });
