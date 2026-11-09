// 빈칸 채우기 시험: 재판 연출 미리보기(/dev/tribunal-presentation)는 개발 빌드에서만 길이 생기는지 — 빈칸찾기 하 15
// 데스크톱·모바일 라우터 글을 읽어 그 길이 import.meta.env DEV 갈래 안에만 있는지, 화면 어디서도 그 주소로 안 보내는지 봄
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "..", "..", "..", "..")
const DEV_PATH = "/dev/tribunal-presentation"

const ROUTERS = [
  { name: "데스크톱", file: join(repoRoot, "frontend", "src", "app", "routes", "index.jsx") },
  { name: "모바일", file: join(repoRoot, "frontend-mobile", "src", "app", "routes", "index.jsx") },
]

// DEV 갈래: `import.meta.env(?).DEV ? [ ... ] : []` 의 [ ... ] 안 글자
function devBranchBodies(source) {
  const bodies = []
  const pattern = /import\.meta\.env\??\.DEV\s*\?\s*\[/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    let depth = 1
    let i = match.index + match[0].length
    const start = i
    while (i < source.length && depth > 0) {
      if (source[i] === "[") depth += 1
      if (source[i] === "]") depth -= 1
      i += 1
    }
    bodies.push({ body: source.slice(start, i - 1), rest: source.slice(i, i + 120) })
  }
  return bodies
}

// 줄 주석(//로 시작하는 줄)은 뺀 글 (주석에 주소를 적은 건 버튼·링크가 아님)
const codeOnly = (source) => source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n")

// 폴더 안 화면 글 전부 (.js·.jsx)
function listSources(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listSources(full))
    else if (/\.(jsx?|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

for (const { name, file } of ROUTERS) {
  test(`${name} 라우터: 미리보기 길은 한 번만, DEV 갈래 안에만 있고 그 밖(운영 빌드)은 빈 배열`, () => {
    const source = readFileSync(file, "utf8")
    assert.equal(source.split(DEV_PATH).length - 1, 1, "길이 한 번만 적혀 있어야 함")
    const branches = devBranchBodies(source).filter((b) => b.body.includes(DEV_PATH))
    assert.equal(branches.length, 1, "DEV 갈래 안에 있어야 함")
    assert.match(branches[0].rest, /^\s*:\s*\[\s*\]/, "DEV가 아니면 빈 배열이어야 함")
  })
}

test("화면 코드 어디에도 미리보기 주소로 보내는 버튼·링크가 없음 (라우터 두 곳만, 주석 빼고)", () => {
  const hits = []
  for (const app of ["frontend", "frontend-mobile"]) {
    for (const file of listSources(join(repoRoot, app, "src"))) {
      if (codeOnly(readFileSync(file, "utf8")).includes(DEV_PATH)) hits.push(file.slice(repoRoot.length + 1).replaceAll("\\", "/"))
    }
  }
  assert.deepEqual(hits.sort(), ["frontend-mobile/src/app/routes/index.jsx", "frontend/src/app/routes/index.jsx"])
})
