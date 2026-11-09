// 플레이어 빌드(dist)와 관리자 빌드(dist-admin)가 안 섞였는지 보는 검사 파일
// npm run build:admin 끝에 돎(dist 없으면 관리자 쪽만), 시험 AD-045가 두 검사 함수를 직접 부름
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 글자로 읽어 볼 파일 (그림·소리·글꼴은 건너뜀)
const TEXT_FILE = /\.(html|js|mjs|css|json|map|svg|txt)$/i

// 관리자 표시: 서버 경로·관리자 뿌리 요소 이름
const ADMIN_MARKERS = ['/admin-api', 'admin-root']
// 플레이어 표시: 소켓 연결·게임 글꼴·로비 색 필터 (관리자 화면엔 하나도 없어야 함)
const PLAYER_MARKERS = ['/socket.io', 'Shilla', 'lobby-menu-red']

// 폴더 안 파일 전부 (하위 폴더까지), 예: ['index.html', 'assets/index-a1.js']
const listFiles = (dir, base = dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name)
  return statSync(full).isDirectory() ? listFiles(full, base) : [path.relative(base, full).replaceAll('\\', '/')]
})

// 표시 글자가 든 파일마다 문제 한 줄, 예: ['assets/index-a1.js 안에 "/admin-api"']
const findMarkers = (dir, markers) => listFiles(dir)
  .filter((file) => TEXT_FILE.test(file))
  .flatMap((file) => {
    const text = readFileSync(path.join(dir, file), 'utf8')
    return markers.filter((marker) => text.includes(marker)).map((marker) => `${file} 안에 "${marker}"`)
  })

// 플레이어 빌드: admin.html 없음 + 관리자 표시 글자 없음
export const checkPlayerBuild = (dir) => {
  if (!existsSync(dir)) return []
  const problems = existsSync(path.join(dir, 'admin.html')) ? ['플레이어 빌드에 admin.html 있음'] : []
  return [...problems, ...findMarkers(dir, ADMIN_MARKERS).map((line) => `플레이어 빌드: ${line}`)]
}

// 관리자 빌드: 있어야 함 + 플레이어 입구(index.html) 없음 + 플레이어 표시 글자 없음
export const checkAdminBuild = (dir) => {
  if (!existsSync(dir)) return [`관리자 빌드 폴더 없음: ${dir}`]
  const problems = existsSync(path.join(dir, 'index.html')) ? ['관리자 빌드에 플레이어 index.html 있음'] : []
  return [...problems, ...findMarkers(dir, PLAYER_MARKERS).map((line) => `관리자 빌드: ${line}`)]
}

const runFromCommandLine = () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const problems = [...checkPlayerBuild(path.join(root, 'dist')), ...checkAdminBuild(path.join(root, 'dist-admin'))]
  if (problems.length > 0) {
    console.error(`[verify-admin-split] 섞임 ${problems.length}건\n- ${problems.join('\n- ')}`)
    process.exit(1)
  }
  console.log('[verify-admin-split] 통과: 플레이어 빌드와 관리자 빌드가 따로임')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runFromCommandLine()
