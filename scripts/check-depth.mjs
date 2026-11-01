// 폴더 깊이 검사 스크립트 (ESLint로는 못 잡아서 따로 둠)
// RULES 폴더 깊이 상한(프론트 src/ 기준, 백엔드 backend/ 기준 6칸)을 넘는 폴더를 찾음
//
// 쓰는 법:
//   node scripts/check-depth.mjs                       프론트 src·백엔드 둘 다 검사
//   node scripts/check-depth.mjs <기준폴더> [--max 6]   그 폴더만 검사
//   --tests                                            시험 폴더(__tests__·tests)도 셈
import fs from 'node:fs'
import path from 'node:path'

const REPO = path.join(import.meta.dirname, '..')
const DEFAULT_ROOTS = [path.join(REPO, 'frontend', 'src'), path.join(REPO, 'backend')]

// 빌드 결과물·패키지·숨김 폴더는 안 셈
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage'])
const TEST_DIRS = new Set(['__tests__', 'tests'])

// 인자 읽기: 기준 폴더 목록, 상한, 시험 폴더 포함 여부
function parseArgs(argv) {
  const roots = []
  let max = 6
  let tests = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max') max = Number(argv[++i])
    else if (argv[i] === '--tests') tests = true
    else roots.push(path.resolve(argv[i]))
  }
  return { roots: roots.length > 0 ? roots : DEFAULT_ROOTS, max, tests }
}

// 기준 폴더 아래를 돌며 상한을 넘는 폴더를 모음
function walk(dir, depth, opts, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const name = entry.name
    if (SKIP.has(name) || name.startsWith('.')) continue
    if (!opts.tests && TEST_DIRS.has(name)) continue
    const child = path.join(dir, name)
    if (depth + 1 > opts.max) out.push({ dir: child, depth: depth + 1 })
    walk(child, depth + 1, opts, out)
  }
}

const opts = parseArgs(process.argv.slice(2))
let failed = false
for (const root of opts.roots) {
  const over = []
  walk(root, 0, opts, over)
  const label = path.relative(REPO, root).split(path.sep).join('/') || '.'
  if (over.length === 0) {
    console.log(`[깊이 OK] ${label} 기준 ${opts.max}칸 이하`)
    continue
  }
  failed = true
  console.log(`[깊이 넘음] ${label} 기준 ${opts.max}칸 초과 ${over.length}개`)
  for (const { dir, depth } of over) {
    console.log(`  ${depth}칸  ${path.relative(root, dir).split(path.sep).join('/')}`)
  }
}
process.exitCode = failed ? 1 : 0
