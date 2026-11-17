import {defineConfig} from 'vite'; import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins:[react()],
  // Dev-only twin of the vercel.json rewrite: serves CSK gallery photos from our own origin so
  // the share-card canvas can read them without CORS problems.
  server:{proxy:{'/cskimg':{target:'https://gallery.chennaisuperkings.com',changeOrigin:true,rewrite:p=>p.replace(/^\/cskimg/,'/PROD/TEAM')}}}
})
