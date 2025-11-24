import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config for Electron + React (renderer)
// The critical piece is base: './' so production assets resolve under file://
export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: 'public', // Serve static assets from public folder
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: false,
    // Ensure proper asset handling for Electron production builds
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          // Images imported from src/assets get proper hashing
          const info = assetInfo.name || ''
          if (info.match(/\.(png|jpe?g|svg|gif|webp|ico)$/)) {
            return 'assets/images/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  server: {
    port: 5180,
    strictPort: true,
  },
})
