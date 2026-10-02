const { mkdirSync, statSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ quiet: true });

const executable = process.argv[2] || 'pg_dump';
const host = process.env.DB_HOST || 'localhost';
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error('This helper only backs up the local development database');
}
const directory = resolve(__dirname, '..', '.backups');
mkdirSync(directory, { recursive: true });
const filename = join(directory, `before-hardware-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
const result = spawnSync(executable, ['--host', host, '--port', process.env.DB_PORT || '5432',
  '--username', process.env.DB_USER || 'postgres', '--dbname', process.env.DB_NAME || 'smartcampuspay',
  '--format', 'custom', '--file', filename], {
  env: { ...process.env, PGPASSWORD: process.env.DB_PASS || 'postgres' }, windowsHide: true,
  encoding: 'utf8', timeout: 120000,
});
if (result.error || result.status !== 0) throw new Error('pg_dump failed; migration must not proceed');
const size = statSync(filename).size;
if (!size) throw new Error('Backup is empty');
console.log(`Backup created: ${filename} (${size} bytes)`);
