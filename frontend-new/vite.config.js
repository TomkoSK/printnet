import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// /api/... sa presmeruje na Go backend, takze netreba riesit CORS
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
