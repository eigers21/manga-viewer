import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages用: リポジトリ名をbase pathに設定
  // ユーザー名.github.io で公開する場合は '/' に変更
  base: '/manga-viewer/',
  plugins: [react()],
  server: {
    proxy: {
      // Box OAuth2 トークン交換用プロキシ（開発時のみ使用）
      '/api/box/token': {
        target: 'https://api.box.com',
        changeOrigin: true,
        rewrite: () => '/oauth2/token',
      },
    },
  },
})
