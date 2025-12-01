import path from 'path';
import { defineConfig } from 'vite';
import { VueMcp } from 'vite-plugin-vue-mcp';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue(), tailwindcss(), VueMcp()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
