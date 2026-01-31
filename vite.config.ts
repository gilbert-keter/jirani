import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { federation } from '@module-federation/vite'
import { fileURLToPath, URL } from 'node:url'
import federationConfig from './module-federation.config.js'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    devtools(),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tailwindcss(),
    federation(federationConfig),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
