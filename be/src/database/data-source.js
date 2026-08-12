require('dotenv').config();
const { join } = require('path');
const { DataSource } = require('typeorm');

const baseDir = join(__dirname, '..');

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
  database: process.env.DB_NAME || 'smartcampuspay',
  entities: [baseDir + '/**/*.entity{.ts,.js}'],
  migrations: [baseDir + '/database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
});

module.exports = dataSource;
