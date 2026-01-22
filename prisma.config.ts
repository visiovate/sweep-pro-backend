import { defineConfig } from '@prisma/cli';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    db: {
      provider: 'postgresql',
      url: { fromEnvVar: 'DATABASE_URL' },
    },
  },
});
