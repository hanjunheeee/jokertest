import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const routesFile = join(dirname(fileURLToPath(import.meta.url)), "..", "index.jsx")
const source = readFileSync(routesFile, "utf8")

// 소스 문자열에서 "코드"인 위치만 true인 마스크를 만든다.
// 문자열 리터럴(', ", `)과 주석(//, /* */) 안의 문자는 전부 false로 표시해서,
// 그 안에 우연히 등장하는 {, }, [, ], "children:" 같은 텍스트가
// 실제 구문 경계 판단(중괄호/대괄호 깊이, 키 탐색)에 섞여 들어가지 않게 한다.
function computeCodeMask(src) {
  const mask = new Array(src.length).fill(true)
  let i = 0

  while (i < src.length) {
    const ch = src[i]
    const next = src[i + 1]

    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") {
        mask[i] = false
        i += 1
      }
      continue
    }

    if (ch === "/" && next === "*") {
      mask[i] = false
      mask[i + 1] = false
      i += 2
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        mask[i] = false
        i += 1
      }
      if (i < src.length) {
        mask[i] = false
        mask[i + 1] = false
        i += 2
      }
      continue
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch
      mask[i] = false
      i += 1
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          mask[i] = false
          i += 1
          if (i < src.length) mask[i] = false
          i += 1
          continue
        }
        mask[i] = false
        i += 1
      }
      if (i < src.length) {
        mask[i] = false
        i += 1
      }
      continue
    }

    i += 1
  }

  return mask
}

// mask가 true인(실제 코드) 위치에서만 target을 찾는다. fromIndex부터 검색한다.
function indexOfInCode(src, mask, target, fromIndex) {
  let searchFrom = fromIndex
  while (searchFrom <= src.length - target.length) {
    const found = src.indexOf(target, searchFrom)
    if (found === -1) return -1
    if (mask[found]) return found
    searchFrom = found + 1
  }
  return -1
}

// idx를 감싸는 가장 안쪽 객체 리터럴의 여는 중괄호 위치를 문자열/주석을 건너뛰며 뒤로 찾는다.
function findEnclosingObjectStart(src, mask, idx) {
  let depth = 0
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (!mask[i]) continue
    if (src[i] === "}") depth += 1
    else if (src[i] === "{") {
      if (depth === 0) return i
      depth -= 1
    }
  }
  throw new Error("감싸는 객체의 여는 중괄호를 찾지 못했습니다.")
}

// objStart(여는 중괄호)에 대응하는 닫는 중괄호 위치를 문자열/주석을 건너뛰며 앞으로 찾는다.
function findMatchingBrace(src, mask, objStart) {
  let depth = 0
  for (let i = objStart; i < src.length; i += 1) {
    if (!mask[i]) continue
    if (src[i] === "{") depth += 1
    else if (src[i] === "}") {
      depth -= 1
      if (depth === 0) return i
    }
  }
  throw new Error("감싸는 객체의 닫는 중괄호를 찾지 못했습니다.")
}

// bracketStart(여는 대괄호)에 대응하는 닫는 대괄호 위치를 문자열/주석을 건너뛰며 앞으로 찾는다.
function findMatchingBracket(src, mask, bracketStart) {
  let depth = 0
  for (let i = bracketStart; i < src.length; i += 1) {
    if (!mask[i]) continue
    if (src[i] === "[") depth += 1
    else if (src[i] === "]") {
      depth -= 1
      if (depth === 0) return i
    }
  }
  throw new Error("children 배열의 닫는 대괄호를 찾지 못했습니다.")
}

// "element: <ProtectedRoute />"를 가진 라우트 객체를 찾아, 그 객체 리터럴 안에서만
// children: 배열을 잘라낸다. 단순히 "<ProtectedRoute 다음에 나오는 첫 children:"이 아니라,
// element: <ProtectedRoute />와 같은 객체({...}) 소속인 children:만 인정한다.
export function extractProtectedRouteChildrenBlock(src) {
  const mask = computeCodeMask(src)

  const elementMatch = /element:\s*<ProtectedRoute\s*\/>/.exec(src)
  assert.notEqual(elementMatch, null, "index.jsx에 element: <ProtectedRoute /> 등록이 없습니다.")
  const elementIdx = elementMatch.index
  assert.ok(mask[elementIdx], "ProtectedRoute 등록이 문자열/주석 안에만 있습니다.")

  const objStart = findEnclosingObjectStart(src, mask, elementIdx)
  const objEnd = findMatchingBrace(src, mask, objStart)

  const childrenKeyIdx = indexOfInCode(src, mask, "children:", objStart)
  assert.notEqual(childrenKeyIdx, -1, "ProtectedRoute를 감싸는 객체 안에 children 배열이 없습니다.")
  assert.ok(
    childrenKeyIdx < objEnd,
    "children 배열이 ProtectedRoute를 감싸는 객체 밖에 있습니다.",
  )

  const bracketStart = indexOfInCode(src, mask, "[", childrenKeyIdx)
  assert.notEqual(bracketStart, -1, "children 배열의 시작 대괄호를 찾지 못했습니다.")

  const bracketEnd = findMatchingBracket(src, mask, bracketStart)
  return src.slice(bracketStart, bracketEnd + 1)
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

test("extractProtectedRouteChildrenBlock은 진짜 children: 앞에 있는 주석/문자열 속 가짜 children:·대괄호를 무시한다", () => {
  const decoySource = `
    export const router = createBrowserRouter([
      {
        element: <ViewportShell />,
        children: [
          // 가짜 children: [ { path: "/decoy", element: <Decoy /> } ]
          { path: "/", element: <LoginPage /> },
          {
            /* 여기도 가짜 children: [1, 2, 3] 처럼 보이는 주석 */
            element: <ProtectedRoute />,
            children: [
              { path: "/mypage", element: <MyPage /> },
              { path: "/podium", element: <PodiumPage /> },
            ],
          },
        ],
      },
    ])
  `

  const block = extractProtectedRouteChildrenBlock(decoySource)

  assert.match(block, /\{\s*path:\s*"\/podium",\s*element:\s*<PodiumPage\s*\/>\s*\}/)
  assert.equal(block.includes("decoy"), false)
  assert.ok(block.includes("/mypage"))
})

test("extractProtectedRouteChildrenBlock은 ProtectedRoute와 무관한 형제 객체의 children 배열을 고르지 않는다", () => {
  const siblingSource = `
    export const router = createBrowserRouter([
      {
        element: <ViewportShell />,
        children: [
          {
            element: <SomeOtherGuard />,
            children: [{ path: "/other", element: <Other /> }],
          },
          {
            element: <ProtectedRoute />,
            children: [{ path: "/podium", element: <PodiumPage /> }],
          },
        ],
      },
    ])
  `

  const block = extractProtectedRouteChildrenBlock(siblingSource)

  assert.match(block, /\{\s*path:\s*"\/podium",\s*element:\s*<PodiumPage\s*\/>\s*\}/)
  assert.equal(block.includes("/other"), false)
})

test("extractProtectedRouteChildrenBlock은 children 배열 안 문자열에 들어있는 대괄호에 깊이 계산이 흔들리지 않는다", () => {
  const bracketInStringSource = `
    export const router = createBrowserRouter([
      {
        element: <ProtectedRoute />,
        children: [
          { path: "/weird", element: <Weird className="w-[10px]" /> },
          { path: "/podium", element: <PodiumPage /> },
        ],
      },
    ])
  `

  const block = extractProtectedRouteChildrenBlock(bracketInStringSource)

  assert.match(block, /\{\s*path:\s*"\/podium",\s*element:\s*<PodiumPage\s*\/>\s*\}/)
  assert.match(block, /\/weird/)
})
