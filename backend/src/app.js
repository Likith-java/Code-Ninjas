import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(__dirname, '../../frontend');
const hasReactBuild = fs.existsSync(path.join(frontendRoot, 'dist', 'index.html'));
const publicDir = hasReactBuild ? path.join(frontendRoot, 'dist') : frontendRoot;

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: (origin, cb) =>
        !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
          ? cb(null, true)
          : cb(new Error('Not allowed by CORS')),
      credentials: true,
    })
  );

  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok' } }));
  app.use('/api/auth', authRoutes);
  app.use('/api/employees', employeeRoutes);

  if (process.env.NODE_ENV !== 'test') {
    app.use(express.static(publicDir));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
