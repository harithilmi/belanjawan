import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so dist/ works from any static host or sub-path.
export default defineConfig({ plugins: [react()], base: './' })
