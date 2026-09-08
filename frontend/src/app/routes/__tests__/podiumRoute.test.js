import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const routesFile = join(dirname(fileURLToPath(import.meta.url)), "..", "index.jsx")
const source = readFileSync(routesFile, "utf8")

function extractProtectedRouteChildrenBlock(src) {
  const protectedRouteIdx = src.indexOf("<ProtectedRoute")
  assert.notEqual(protectedRouteIdx, -1, "index.jsx에 ProtectedRoute 사용이 없습니다.")

  const childrenKeyIdx = src.indexOf("children:", protectedRouteIdx)
  assert.notEqual(childrenKeyIdx, -1, "ProtectedRoute 다음에 children 배열이 없습니다.")

  const bracketStart = src.indexOf("[", childrenKeyIdx)
  assert.notEqual(bracketStart, -1, "children 배열의 시작 대괄호를 찾지 못했습니다.")

  let depth = 0
  for (let i = bracketStart; i < src.length; i += 1) {
    if (src[i] === "[") depth += 1
    if (src[i] === "]") {
      depth -= 1
      if (depth === 0) {
        return src.slice(bracketStart, i + 1)
      }
    }
  }

  throw new Error("children 배열의 닫는 대괄호를 찾지 못했습니다.")
}

test("index.jsx가 PodiumPage를 podium 도메인 경로에서 import한다", () => {
  assert.match(
    source,
    /import\s+PodiumPage\s+from\s+"@\/domains\/podium\/pages\/PodiumPage\.jsx"/,
  )
})

test("/podium 경로가 ProtectedRoute의 children 배열 안에 등록되어 있다", () => {
  const childrenBlock = extractProtectedRouteChildrenBlock(source)

  assert.match(
    childrenBlock,
    /\{\s*path:\s*"\/podium",\s*element:\s*<PodiumPage\s*\/>\s*\}/,
    "ProtectedRoute 자식 목록에 /podium → <PodiumPage /> 등록이 없습니다.",
  )
})

test("/podium 경로 등록은 ProtectedRoute 밖(로그인 전 접근 가능 구간)에는 없다", () => {
  const protectedRouteIdx = source.indexOf("<ProtectedRoute")
  const beforeProtectedRoute = source.slice(0, protectedRouteIdx)

  assert.equal(beforeProtectedRoute.includes('"/podium"'), false)

  const podiumOccurrences = source.split('"/podium"').length - 1
  assert.equal(podiumOccurrences, 1, "/podium 경로가 중복 등록되어 있습니다.")
})
