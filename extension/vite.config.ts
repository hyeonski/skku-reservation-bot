import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import path from 'node:path';
import manifest from './manifest.json' with { type: 'json' };

function defaultApiBaseUrl(mode: string): string {
  if (mode === 'main') return 'https://api.skkubot.xyz';
  if (mode === 'staging') return 'https://staging-api.skkubot.xyz';
  return 'http://localhost:8000';
}

function hostPermissionFromBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.origin}/*`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const apiBaseUrl = (env.VITE_API_BASE_URL || defaultApiBaseUrl(mode)).replace(/\/+$/, '');
  const apiHostPermission = hostPermissionFromBaseUrl(apiBaseUrl);

  return {
    plugins: [
      react(),
      crx({
        manifest: {
          ...manifest,
          host_permissions: [
            'https://kingoinfo.skku.edu/*',
            'https://login.skku.edu/*',
            apiHostPermission,
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@gls': path.resolve(__dirname, '../shared/gls'),
      },
    },
  };
});
