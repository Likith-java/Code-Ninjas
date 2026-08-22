import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function bootstrap() {
  process.env.NODE_ENV = 'test';
  const dbPath = path.join(
    os.tmpdir(),
    `dayflow-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
  process.env.DB_PATH = dbPath;

  const { createApp } = await import('../src/app.js');
  const { seed } = await import('../src/seed.js');
  seed();

  const supertest = (await import('supertest')).default;
  const request = supertest(createApp());
  return { request, dbPath };
}

export function cleanup(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbPath + suffix, { force: true });
    } catch {
      /* best effort */
    }
  }
}

export async function login(request, email, password) {
  const res = await request.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status}`);
  }
  return {
    user: res.body.data,
    cookie: (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; '),
  };
}
