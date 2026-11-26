// 프론트 소스 파일이 유효한 UTF-8(BOM 없음·깨진 대체 문자 없음)인지 검사하는 스크립트
// npm run check:utf8이 부름 (기본 대상: frontend/src)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TEXT_EXT = /\.(js|jsx|mjs|cjs|ts|tsx|css|html|json|svg|md|txt)$/i
const decoder = new TextDecoder('utf-8', { fatal: true })

// 기준 폴더 아래의 텍스트 소스 파일 경로를 재귀로 모음
function collectTextFiles(dir, base = dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return []
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectTextFiles(full, base)
    if (!TEXT_EXT.test(entry.name)) return []
    return [path.relative(base, full).replaceAll('\\', '/')]
  })
}

// 바이트 버퍼 하나가 BOM 없는 유효한 UTF-8이고 깨진 대체 문자(\uFFFD)가 없는지 확인함
export function checkUtf8Buffer(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return 'UTF-8 BOM 있음'
  }
  let text
  try {
    text = decoder.decode(buf)
  } catch {
    return '유효하지 않은 UTF-8 바이트 시퀀스'
  }
  if (text.includes('\uFFFD')) {
    return '깨진 대체 문자(\\uFFFD) 있음'
  }
  return null
}

// 지정 폴더 아래 파일들을 모두 검사해 문제 목록과 검사 파일 수를 돌려줌
export function verifyUtf8Dir(dir) {
  const files = collectTextFiles(dir)
  const problems = []
  for (const rel of files) {
    const reason = checkUtf8Buffer(readFileSync(path.join(dir, rel)))
    if (reason) problems.push(`${rel}: ${reason}`)
  }
  return { count: files.length, problems }
}

// 명령줄에서 실행될 때 src 폴더를 검사하고 결과를 출력함
function runCli() {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'src')
  const { count, problems } = verifyUtf8Dir(targetDir)
  if (problems.length > 0) {
    console.error(`[check:utf8] 실패 ${problems.length}건 (검사 ${count}개)\n- ${problems.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`[check:utf8] 통과: ${count}개 파일 모두 유효한 UTF-8 (BOM·대체 문자 없음)`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli()
}
