import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Dev-only middleware so `/api/status` works directly on `npm run dev` (localhost:5173)
 * using local `.env` credentials instead of falling through to Vite's SPA HTML fallback.
 */
function localStatusApiPlugin(): Plugin {
  return {
    name: 'sked-local-status-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }

      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const rawUrl = req.url ?? '';
          const parsedUrl = new URL(rawUrl, 'http://localhost');
          const apiModuleMap: Record<string, string> = {
            '/api/status': '/api/status.ts',
            '/api/agenda/manage': '/api/agenda/manage.ts',
          };
          const modulePath = apiModuleMap[parsedUrl.pathname];
          if (!modulePath) {
            next();
            return;
          }

          // Pick up live .env edits during local development without requiring a Vite restart
          const freshEnv = loadEnv(server.config.mode, process.cwd(), '');
          for (const [key, value] of Object.entries(freshEnv)) {
            process.env[key] = value;
          }

          const sendJson = (statusCode: number, body: unknown) => {
            if (res.writableEnded) return;
            res.statusCode = statusCode;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
          };

          try {
            const mod = (await server.ssrLoadModule(modulePath)) as {
              default?: (vReq: unknown, vRes: unknown) => Promise<unknown>;
            };
            if (typeof mod.default !== 'function') {
              sendJson(500, { error: `Invalid ${parsedUrl.pathname} handler export.` });
              return;
            }

            const query: Record<string, string> = {};
            parsedUrl.searchParams.forEach((val, key) => {
              query[key] = val;
            });

            let body: unknown = undefined;
            if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
              const chunks: Buffer[] = [];
              for await (const chunk of req) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              }
              const rawBody = Buffer.concat(chunks).toString('utf8').trim();
              if (rawBody) {
                try {
                  body = JSON.parse(rawBody);
                } catch {
                  body = rawBody;
                }
              }
            }

            const vercelReq = Object.assign(req, { query, body });
            const vercelRes = {
              setHeader: (name: string, value: string | string[]) => {
                res.setHeader(name, value);
                return vercelRes;
              },
              status: (code: number) => {
                res.statusCode = code;
                return vercelRes;
              },
              json: (jsonBody: unknown) => {
                sendJson(res.statusCode || 200, jsonBody);
                return vercelRes;
              },
            };

            await mod.default(vercelReq, vercelRes);
          } catch (err) {
            sendJson(500, {
              error: err instanceof Error ? err.message : `Local ${parsedUrl.pathname} error.`,
            });
          }
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), localStatusApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    css: false,
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand'],
        },
      },
    },
  },
});
