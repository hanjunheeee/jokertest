// 여러 계정 도구용 화면 빌드 파일, PC(frontend)·폰(frontend-mobile) 화면을 .run/multi/front/<이름>에 따로 빌드함
// start.js가 자식 프로세스로 부름 (node build.mjs desktop|mobile <빌드 폴더>), 앱 코드·설정 파일은 안 고치고 빌드할 때만 바꿔 끼움
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(HERE, '..', '..', '..')
const APPS = {
  desktop: path.join(REPO, 'frontend'),
  mobile: path.join(REPO, 'frontend-mobile'),
}
// 서버 주소를 정하는 파일 (데스크톱·모바일이 같이 씀)
const ENV_FILE = path.join(REPO, 'frontend', 'src', 'shared', 'env.js')
const API_LINE = /export const API_BASE_URL\s*=\s*[^;\n]+;?/

// 서버 주소를 "지금 화면 주소"로 바꿔 끼움 → 칸마다 자기 주소(p3.multi.localhost:5390)로 api·소켓을 부르고 쿠키도 칸마다 따로 남음
// 파일은 안 고침 (빌드할 때 읽은 글만 바꿈), env.js 모양이 바뀌어 못 바꾸면 빌드를 멈춤
function sameOriginApi() {
  const target = path.normalize(ENV_FILE).toLowerCase()
  return {
    name: 'multi-same-origin-api',
    enforce: 'pre',
    load(id) {
      if (path.normalize(id.split('?')[0]).toLowerCase() !== target) return null
      const code = fs.readFileSync(ENV_FILE, 'utf8')
      if (!API_LINE.test(code)) throw new Error('frontend/src/shared/env.js에서 API_BASE_URL 줄을 못 찾음 (도구 build.mjs를 맞춰야 함)')
      return code.replace(API_LINE, 'export const API_BASE_URL = globalThis.location?.origin;')
    },
  }
}

async function main() {
  const [name, outDir] = process.argv.slice(2)
  const dir = APPS[name]
  if (!dir || !outDir) throw new Error('쓰는 법: node build.mjs desktop|mobile <빌드 폴더>')
  // 개발 서버와 같게 DEV=true로 빌드 (개발 전용 단추·시험 결제 키가 npm run dev와 같음)
  process.env.NODE_ENV = 'development'
  const vite = await import(pathToFileURL(path.join(dir, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
  await vite.build({
    configFile: path.join(dir, 'vite.config.js'),
    root: dir,
    mode: 'development',
    logLevel: 'warn',
    // 화면 폴더 .env는 안 읽음 (진짜 광고 값·다른 서버 주소가 안 섞이게)
    envDir: false,
    // 개발 서버(5173·5174)·e2e 빌드와 캐시를 안 같이 씀
    cacheDir: path.join(dir, 'node_modules', '.vite-multi'),
    plugins: [sameOriginApi()],
    build: {
      outDir,
      emptyOutDir: true,
      // public 그림·소리(수백 MB)는 안 베낌 → 도구 서버가 frontend/public에서 바로 줌
      copyPublicDir: false,
      chunkSizeWarningLimit: 100000,
    },
  })
}

main().catch((error) => {
  console.error(`[여러계정 빌드] 실패: ${error?.stack ?? error}`)
  process.exit(1)
})
