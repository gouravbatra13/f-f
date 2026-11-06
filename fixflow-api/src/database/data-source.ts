import { DataSource } from 'typeorm';
import { getDatabaseConfig } from '../config/database.config.js';
import { createDataSourceOptions } from './typeorm-options.js';

export default new DataSource(
  createDataSourceOptions(getDatabaseConfig()),
);
