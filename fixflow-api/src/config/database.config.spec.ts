import { getDatabaseConfig } from './database.config.js';

describe('getDatabaseConfig', () => {
  const credentials = {
    MYSQL_HOST: '127.0.0.1',
    MYSQL_USER: 'fixflow_local',
    MYSQL_PASSWORD: 'local-test-password',
    MYSQL_DATABASE: 'fixflow_test',
  };

  it('uses the Compose-published port when MYSQL_PORT is omitted', () => {
    expect(getDatabaseConfig(credentials).port).toBe(33316);
  });

  it('honors an explicitly configured local MySQL port', () => {
    expect(getDatabaseConfig({ ...credentials, MYSQL_PORT: '3306' }).port).toBe(
      3306,
    );
  });
});
