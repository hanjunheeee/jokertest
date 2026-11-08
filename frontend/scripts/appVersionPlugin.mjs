// 화면 버전 플러그인 (빌드 때 git 해시+빌드 시각으로 버전을 정해 화면 코드에 넣고 version.json으로 내보냄)
// 데스크톱·모바일 vite.config.js가 씀, 화면은 몇 분마다 version.json을 받아 다르면 새로고침 안내
import { execSync } from 'node:child_process'

// git 짧은 해시 (git 없으면 nogit)
const gitShortHash = () => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'nogit'
  } catch {
    return 'nogit'
  }
}

// 예: a1b2c3d-20261109T031500Z (같은 커밋을 다시 빌드해도 새 버전)
export const buildAppVersion = (now = new Date(), hash = gitShortHash()) => (
  `${hash}-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
)

// 빌드 때만 버전을 넣음 (개발 서버는 버전 없음 → 화면이 확인을 안 함)
export function appVersionPlugin() {
  let version = null
  return {
    name: 'mmc-app-version',
    config(_config, { command }) {
      if (command !== 'build') return undefined
      version = buildAppVersion()
      return { define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) } }
    },
    generateBundle() {
      if (!version) return
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ version, builtAt: new Date().toISOString() })}\n`,
      })
    },
  }
}
