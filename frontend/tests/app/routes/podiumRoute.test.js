import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const routesFile = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "src", "app", "routes", "index.jsx")
const source = readFileSync(routesFile, "utf8")

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

function findDirectChildrenKeyIndex(src, mask, objStart) {
  const key = "children:"
  let depth = 0

  for (let i = objStart; i < src.length; i += 1) {
    if (!mask[i]) continue
    const ch = src[i]

    if (ch === "{") {
      depth += 1
      continue
    }

    if (ch === "}") {
      depth -= 1
      if (depth === 0) return -1
      continue
    }

    if (depth === 1 && ch === key[0] && src.startsWith(key, i)) {
      let wholeKeyIsCode = true
      for (let j = i; j < i + key.length; j += 1) {
        if (!mask[j]) {
          wholeKeyIsCode = false
          break
        }
      }
      if (wholeKeyIsCode) return i
    }
  }

  throw new Error("감싸는 객체의 닫는 중괄호를 찾지 못했습니다.")
}

function computeCommentMask(src) {
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
      i += 1
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          i += 2
          continue
        }
        i += 1
      }
      if (i < src.length) i += 1
      continue
    }

    i += 1
  }

  return mask
}

function assertMatchInCode(str, regex, message) {
  const mask = computeCommentMask(str)
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`
  const globalRegex = new RegExp(regex.source, flags)

  let match = globalRegex.exec(str)
  while (match !== null) {
    const start = match.index
    const end = start + match[0].length
    let allCode = end > start
    for (let i = start; i < end; i += 1) {
      if (!mask[i]) {
        allCode = false
        break
      }
    }
    if (allCode) return match

    globalRegex.lastIndex = match[0].length === 0 ? start + 1 : globalRegex.lastIndex
    match = globalRegex.exec(str)
  }

  assert.fail(message || `코드 영역에서 패턴을 찾지 못했습니다: ${regex}`)
}

export function extractProtectedRouteChildrenBlock(src) {
  const mask = computeCodeMask(src)

  const elementMatch = /element:\s*<ProtectedRoute\s*\/>/.exec(src)
  assert.notEqual(elementMatch, null, "index.jsx에 element: <ProtectedRoute /> 등록이 없습니다.")
  const elementIdx = elementMatch.index
  assert.ok(mask[elementIdx], "ProtectedRoute 등록이 문자열/주석 안에만 있습니다.")

  const objStart = findEnclosingObjectStart(src, mask, elementIdx)

  const childrenKeyIdx = findDirectChildrenKeyIndex(src, mask, objStart)
  assert.notEqual(
    childrenKeyIdx,
    -1,
    "ProtectedRoute를 감싸는 객체의 직접 속성으로 children 배열이 없습니다.",
  )

  const bracketStart = indexOfInCode(src, mask, "[", childrenKeyIdx)
  assert.notEqual(bracketStart, -1, "children 배열의 시작 대괄호를 찾지 못했습니다.")

  const bracketEnd = findMatchingBracket(src, mask, bracketStart)
  return src.slice(bracketStart, bracketEnd + 1)
}

const PODIUM_REDIRECT_PATTERN =
  /\{\s*path:\s*"\/podium",\s*element:\s*<Navigate\s+to="\/lobby"\s+replace\s*\/>\s*\}/

test("index.jsx가 PodiumPage를 더 이상 import하지 않고, 대신 react-router-dom의 Navigate를 import한다", () => {
  assert.equal(
    /import\s+PodiumPage\s+from\s+"@\/domains\/podium\/pages\/PodiumPage\.jsx"/.test(source),
    false,
    "비활성화된 /podium이 아직 PodiumPage를 import하고 있습니다.",
  )

  assertMatchInCode(
    source,
    /import\s*\{[^}]*\bNavigate\b[^}]*\}\s*from\s*"react-router-dom"/,
    "리다이렉트에 쓸 Navigate를 react-router-dom에서 import하지 않았습니다.",
  )
})

test("/podium 경로가 ProtectedRoute의 children 배열 안에서 /lobby로 replace 이동하도록 등록되어 있다", () => {
  const childrenBlock = extractProtectedRouteChildrenBlock(source)

  assertMatchInCode(
    childrenBlock,
    PODIUM_REDIRECT_PATTERN,
    "ProtectedRoute 자식 목록에 /podium → <Navigate to=\"/lobby\" replace /> 등록이 없습니다.",
  )
})

test("/podium 비활성 등록은 ProtectedRoute 밖(로그인 전 접근 가능 구간)에는 없고, 활성 PodiumPage 등록도 남아 있지 않다", () => {
  const protectedRouteIdx = source.indexOf("<ProtectedRoute")
  const beforeProtectedRoute = source.slice(0, protectedRouteIdx)

  assert.equal(beforeProtectedRoute.includes('"/podium"'), false)

  const podiumOccurrences = source.split('"/podium"').length - 1
  assert.equal(podiumOccurrences, 1, "/podium 경로가 중복 등록되어 있습니다.")

  assert.equal(
    /element:\s*<PodiumPage\s*\/>/.test(source),
    false,
    "어떤 라우트도 더 이상 <PodiumPage />를 그리면 안 됩니다.",
  )
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
              { path: "/podium", element: <Navigate to="/lobby" replace /> },
            ],
          },
        ],
      },
    ])
  `

  const block = extractProtectedRouteChildrenBlock(decoySource)

  assertMatchInCode(block, PODIUM_REDIRECT_PATTERN)
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
            children: [{ path: "/podium", element: <Navigate to="/lobby" replace /> }],
          },
        ],
      },
    ])
  `

  const block = extractProtectedRouteChildrenBlock(siblingSource)

  assertMatchInCode(block, PODIUM_REDIRECT_PATTERN)
  assert.equal(block.includes("/other"), false)
})

test("extractProtectedRouteChildrenBlock은 children 배열 안 문자열에 들어있는 대괄호에 깊이 계산이 흔들리지 않는다", () => {
  const bracketInStringSource = `
    export const router = createBrowserRouter([
      {
        element: <ProtectedRoute />,
        children: [
          { path: "/weird", element: <Weird className="w-[10px]" /> },
          { path: "/podium", element: <Navigate to="/lobby" replace /> },
        ],
      },
    ])
  `

  const block = extractProtectedRouteChildrenBlock(bracketInStringSource)

  assertMatchInCode(block, PODIUM_REDIRECT_PATTERN)
  assertMatchInCode(block, /\/weird/)
})

test("extractProtectedRouteChildrenBlock은 ProtectedRoute 객체의 형제 속성 값 안에 중첩된 children:을 직접 속성으로 착각하지 않는다", () => {
  const nestedSiblingPropertySource = `
    export const router = createBrowserRouter([
      {
        element: <ViewportShell />,
        children: [
          {
            element: <ProtectedRoute />,
            meta: { children: ["decoy-nested-not-a-route-array"] },
            children: [
              { path: "/mypage", element: <MyPage /> },
              { path: "/podium", element: <Navigate to="/lobby" replace /> },
            ],
          },
        ],
      },
    ])
  `

  const block = extractProtectedRouteChildrenBlock(nestedSiblingPropertySource)

  assertMatchInCode(block, PODIUM_REDIRECT_PATTERN)
  assert.equal(block.includes("decoy-nested-not-a-route-array"), false)
  assert.ok(block.includes("/mypage"))
})

test("assertMatchInCode는 주석 안에만 있는 가짜 경로 등록을 실제 코드로 인정하지 않는다", () => {
  const commentOnlyRegistrationSource = `
    export const router = createBrowserRouter([
      {
        element: <ProtectedRoute />,
        children: [
          // { path: "/podium", element: <Navigate to="/lobby" replace /> } -- 아직 실제로는 등록 안 함
          { path: "/mypage", element: <MyPage /> },
        ],
      },
    ])
  `

  const block = extractProtectedRouteChildrenBlock(commentOnlyRegistrationSource)

  assert.throws(() => {
    assertMatchInCode(block, PODIUM_REDIRECT_PATTERN)
  })
})

test("보호 라우트 밖에 등록된 /podium 리다이렉트는 ProtectedRoute 자식 검사에서 인정되지 않는다", () => {
  const outsideProtectedRouteSource = `
    export const router = createBrowserRouter([
      {
        element: <ViewportShell />,
        children: [
          { path: "/podium", element: <Navigate to="/lobby" replace /> },
          {
            element: <ProtectedRoute />,
            children: [{ path: "/mypage", element: <MyPage /> }],
          },
        ],
      },
    ])
  `

  const block = extractProtectedRouteChildrenBlock(outsideProtectedRouteSource)

  assert.throws(() => {
    assertMatchInCode(block, PODIUM_REDIRECT_PATTERN)
  })
})
