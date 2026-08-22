import { defineConfig } from 'drizzle-kit';
const databaseUrl = `${process.env.DATABASE_URL}`;
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './database/migrations',
  schemaFilter: ['payments_schema'],
  dbCredentials: {
    url: databaseUrl
  }
});
