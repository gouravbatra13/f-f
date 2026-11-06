import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';
import type { DatabaseConfig } from '../config/database.config.js';

const databaseDirectory = dirname(fileURLToPath(import.meta.url));

export function createDataSourceOptions(
  database: DatabaseConfig,
): DataSourceOptions {
  return {
    type: 'mysql',
    ...database,
    entities: [join(databaseDirectory, '..', '**', '*.entity.js')],
    migrations: [join(databaseDirectory, 'migrations', '*.js')],
    synchronize: false,
    migrationsRun: false,
  };
}

export function createNestTypeOrmOptions(
  database: DatabaseConfig,
): TypeOrmModuleOptions {
  return {
    ...createDataSourceOptions(database),
    autoLoadEntities: true,
    retryAttempts: 5,
    retryDelay: 1000,
  };
}
