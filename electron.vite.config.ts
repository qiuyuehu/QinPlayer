import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 主进程配置
  // electron-vite 将 TypeScript 编译为 CommonJS
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['better-sqlite3'],  // 原生模块不打包进 bundle
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
          scanner: resolve(__dirname, 'electron/workers/scanner.ts')
        }
      }
    }
  },

  // 预加载脚本配置
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts')
        }
      }
    }
  },

  // 渲染进程配置
  // React + TypeScript，Vite 开发服务器
  renderer: {
    root: resolve(__dirname),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    },
    plugins: [react()]
  }
})
