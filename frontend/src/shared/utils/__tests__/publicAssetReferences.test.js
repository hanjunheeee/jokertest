/**
 * frontend/src 전체에서 publicAsset(...) 호출과 에셋 상수가 참조하는 public 경로를
 * 모두 모아 frontend/public에 실제로 존재하는지 검사합니다.
 *
 * 이전 라운드(리터럴을 `'`/`"`로만, 이미 존재하는 최상위 디렉터리로만, 중첩 호출 없는
 * publicAsset(...) 인자만 스캔) 검토에서 아래 4가지가 조용히 빠져나간다는 지적을 받았다:
 *   1) frontend/public에 없는 최상위 디렉터리를 참조하면 정규식이 애초에 매치하지 않아
 *      "없음"이 아니라 "안 봄"이 된다.
 *   2) 선행 슬래시가 없는 경로("button/x.png")도 매치하지 않는다.
 *   3) 백틱(`) 정적 리터럴(보간 없음)은 원래 정규식이 따옴표만 받아 놓친다.
 *   4) publicAsset(fn(x)) 처럼 인자 안에 괄호가 있는 호출은 CALL_RE가 못 잡는다.
 *   5) publicAsset(변수) 형태의 "변수"가 상수도 아니고 리터럴도 아니면(진짜 런타임 값)
 *      아무 데도 안 걸리고 조용히 통과한다.
 *
 * 이 파일은 위 5개를 각각 이렇게 닫는다:
 *   1,2,3 — checkAssetPathExists()가 따옴표 3종(', ", `)을 모두 훑고, 선행 슬래시를
 *     보정하고, "최상위 디렉터리 자체가 없음"과 "디렉터리는 있는데 파일이 없음"을 구분해
 *     실패시킨다(PUBLIC_TOP_DIRS로 매치 대상을 제한하지 않는다).
 *   4 — extractCallArgs()가 괄호 깊이를 직접 세어 인자를 잘라낸다(정규식 lookahead 아님).
 *   5 — publicAsset(...) 호출 인자를 classifyCallArg()로 분류한다. 인자가 리터럴이거나,
 *     "같은 파일의 최상위 const" 또는 "로컬/@ import된 파일"에 뿌리를 둔 단순
 *     식별자.프로퍼티/[첨자] 체인(함수 호출 없음)이면 "covered"(그 파일의 리터럴은 이
 *     테스트의 일반 스캔이 어차피 훑는다). 그 외(진짜 지역 변수·prop·함수 호출)는
 *     KNOWN_DYNAMIC_PUBLIC_ASSET_CALL_ARGS에 "왜 안전한지" 근거와 함께 등록돼 있지
 *     않으면 실패한다 — 새로 생기는 미등록 동적 인자는 자동으로 테스트를 깨뜨린다.
 *
 * 백틱 템플릿(`${DIR}/파일.png`)의 보간이 "같은 파일 또는 로컬 import된 파일의 최상위
 * const"로 해석되면 그 값을 재구성해 존재를 검사한다(resolveExprToLiteral). 함수
 * 파라미터 보간(`${variant}`, `${config.folder}` 등)처럼 정적으로 못 푸는 경우는
 * frontend/src를 뒤져 정확히 3개 파일(storeItems.js, skinCardWearCatalog.js,
 * forbiddenRecords/assets.js)에만 있고, 이 세 파일은 아래에서 실제로 동적 import해
 * 계산된 진짜 문자열 값으로 검증한다(정규식 재현이 아니라 Node가 직접 실행). 그 외
 * 파일에서 새로 이런 템플릿이 생기면(TEMPLATE_VERIFIED_BY_IMPORT_FILES에 없으면)
 * 테스트가 실패해 사람이 봐야 한다.
 *
 * __tests__ 디렉터리·*.test.js는 스캔에서 뺀다 — 목(mock) 값으로 존재하지 않는 경로를
 * 일부러 쓰는 테스트가 있어서(예: profileCustomization.store.test.js의 임의 photoSrc),
 * 그 값들을 "실제 에셋 참조"로 검증하면 거짓 실패가 난다.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
// __tests__ → utils → shared → src
const SRC_DIR = path.resolve(HERE, "..", "..", "..")
// src → frontend → public
const PUBLIC_DIR = path.resolve(HERE, "..", "..", "..", "..", "public")

const MEDIA_EXT_RE = "png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|ogg"
const MEDIA_TAIL_RE = new RegExp(`\\.(?:${MEDIA_EXT_RE})$`, "i")
const PUBLIC_ASSET_DEFINITION_FILE = path.join(SRC_DIR, "shared", "utils", "publicAsset.js")

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue

    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (/\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
}

function relativeToSrc(file) {
  return path.relative(SRC_DIR, file).split(path.sep).join("/")
}

const SOURCE_FILES = walk(SRC_DIR)

const PUBLIC_TOP_DIRS = fs
  .readdirSync(PUBLIC_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

/** file(절대경로) → stripComments된 원문 (게으르게도 채워짐 — cross-file 해석용) */
const fileContents = new Map()
for (const file of SOURCE_FILES) {
  fileContents.set(file, stripComments(fs.readFileSync(file, "utf8")))
}

function getFileContent(file) {
  if (fileContents.has(file)) return fileContents.get(file)
  try {
    const content = stripComments(fs.readFileSync(file, "utf8"))
    fileContents.set(file, content)
    return content
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 리터럴/템플릿 문자열 토크나이저 — 따옴표 3종(', ", `)을 동일하게 다룬다.
// ---------------------------------------------------------------------------

function readStringLiteralAt(content, i) {
  const quote = content[i]
  let j = i + 1
  let raw = ""
  while (j < content.length) {
    const c = content[j]
    if (c === "\\") {
      raw += c + (content[j + 1] ?? "")
      j += 2
      continue
    }
    if (c === quote) {
      j += 1
      break
    }
    if (c === "\n" && quote !== "`") break // 일반 문자열은 줄바꿈에서 종료(비정상 리터럴로 취급)
    raw += c
    j += 1
  }
  return { quote, raw, start: i, end: j }
}

function findStringLiterals(content) {
  const out = []
  let i = 0
  while (i < content.length) {
    const ch = content[i]
    if (ch === "'" || ch === '"' || ch === "`") {
      const lit = readStringLiteralAt(content, i)
      out.push(lit)
      i = lit.end
      continue
    }
    i += 1
  }
  return out
}

/** 백틱 raw 내용을 정적 조각(parts)과 보간식(exprs)으로 나눈다. 중첩 중괄호를 지원한다. */
function splitTemplateLiteral(raw) {
  const parts = []
  const exprs = []
  let i = 0
  let currentStatic = ""
  while (i < raw.length) {
    if (raw[i] === "$" && raw[i + 1] === "{") {
      parts.push(currentStatic)
      currentStatic = ""
      let depth = 1
      let j = i + 2
      let expr = ""
      while (j < raw.length && depth > 0) {
        if (raw[j] === "{") depth++
        else if (raw[j] === "}") {
          depth--
          if (depth === 0) break
        }
        expr += raw[j]
        j++
      }
      exprs.push(expr)
      i = j + 1
    } else {
      currentStatic += raw[i]
      i++
    }
  }
  parts.push(currentStatic)
  return { parts, exprs }
}

function unescapeLiteral(s) {
  return s.replace(/\\(.)/g, (_, c) => {
    if (c === "n") return "\n"
    if (c === "t") return "\t"
    return c
  })
}

// ---------------------------------------------------------------------------
// import 맵 + 최상위 const 리터럴 해석 (같은 파일 → import된 로컬 파일, 얕은 재귀)
// ---------------------------------------------------------------------------

function resolveModuleSpecifier(spec, fromFile) {
  let base
  if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec)
  else if (spec.startsWith("@/")) base = path.join(SRC_DIR, spec.slice(2))
  else return null // 외부 패키지 — 이 스캔 대상이 아니다

  for (const candidate of [
    base,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

const importMapCache = new Map()

/** file → Map(localName → { file: 절대경로|null, imported: string }) */
function parseImportMap(file) {
  if (importMapCache.has(file)) return importMapCache.get(file)

  const content = getFileContent(file) ?? ""
  const map = new Map()
  const importRe =
    /import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}|\*\s+as\s+([\w$]+))?\s*from\s*["']([^"']+)["']/g
  let m
  while ((m = importRe.exec(content))) {
    const [, defaultName, namedList, namespaceName, spec] = m
    const resolvedFile = resolveModuleSpecifier(spec, file)

    if (defaultName) map.set(defaultName, { file: resolvedFile, imported: "default" })
    if (namespaceName) map.set(namespaceName, { file: resolvedFile, imported: "*" })
    if (namedList) {
      for (const part of namedList.split(",")) {
        const piece = part.trim()
        if (!piece) continue
        const asMatch = piece.match(/^([\w$]+)\s+as\s+([\w$]+)$/)
        if (asMatch) map.set(asMatch[2], { file: resolvedFile, imported: asMatch[1] })
        else map.set(piece, { file: resolvedFile, imported: piece })
      }
    }
  }

  importMapCache.set(file, map)
  return map
}

function topLevelConstRegex(name) {
  return new RegExp(`^(?:export\\s+)?const\\s+${name}\\s*=\\s*`, "m")
}

/** content[index..]에서 값(문자열/템플릿)을 읽어 리터럴 문자열로 돌려준다. 아니면 null. */
function resolveValueAt(content, index, file) {
  let i = index
  while (i < content.length && /\s/.test(content[i])) i++
  const ch = content[i]
  if (ch !== '"' && ch !== "'" && ch !== "`") return null // 객체/배열/기타 표현식은 대상 밖

  const lit = readStringLiteralAt(content, i)
  if (lit.quote !== "`") return unescapeLiteral(lit.raw)

  const { parts, exprs } = splitTemplateLiteral(lit.raw)
  if (exprs.length === 0) return unescapeLiteral(parts[0])

  const resolvedExprs = exprs.map((e) => resolveExprToLiteral(e, file))
  if (resolvedExprs.some((v) => v === null)) return null
  return parts.reduce((acc, part, idx) => acc + unescapeLiteral(part) + (resolvedExprs[idx] ?? ""), "")
}

function findTopLevelConstLiteral(file, name) {
  const content = getFileContent(file)
  if (content === null) return null
  const m = topLevelConstRegex(name).exec(content)
  if (!m) return null
  return resolveValueAt(content, m.index + m[0].length, file)
}

/** `${expr}` 보간식을 리터럴 문자열로 해석한다 — 단순 식별자와 리터럴만 지원한다. */
function resolveExprToLiteral(expr, file, visited = new Set()) {
  const trimmed = expr.trim()
  if (/^["'`]/.test(trimmed)) return resolveValueAt(trimmed, 0, file)
  if (!/^[\w$]+$/.test(trimmed)) return null // 멤버 접근·함수 호출·연산 등은 대상 밖
  return resolveIdentifierLiteral(trimmed, file, visited)
}

function resolveIdentifierLiteral(name, file, visited) {
  const key = `${file}::${name}`
  if (visited.has(key)) return null
  visited.add(key)

  const local = findTopLevelConstLiteral(file, name)
  if (local !== null) return local

  const importMap = parseImportMap(file)
  const entry = importMap.get(name)
  if (entry && entry.file && entry.imported !== "default" && entry.imported !== "*") {
    return resolveIdentifierLiteral(entry.imported, entry.file, visited)
  }
  return null
}

// ---------------------------------------------------------------------------
// 존재 검사 — 최상위 디렉터리 없음 / 파일 없음을 구분해 실패시킨다
// ---------------------------------------------------------------------------

function looksLikeAssetPath(str) {
  if (typeof str !== "string" || !str) return false
  if (str.includes("://")) return false
  if (str.startsWith(".")) return false
  if (!str.includes("/")) return false
  return MEDIA_TAIL_RE.test(str)
}

function describeDirectory(dir) {
  if (!fs.existsSync(dir)) return `(디렉터리 없음: ${dir})`
  return fs.readdirSync(dir).join("\n")
}

/** PUBLIC_TOP_DIRS로 매치 대상을 제한하지 않는다 — 없는 최상위 디렉터리도 그대로 검사해 실패시킨다. */
function checkAssetPathExists(rawPath, sourceDescription, failures) {
  const withSlash = rawPath.startsWith("/") ? rawPath : `/${rawPath}`
  const normalized = withSlash.normalize("NFC")
  const topDir = normalized.split("/").filter(Boolean)[0]
  const topDirAbsolute = path.join(PUBLIC_DIR, topDir ?? "")

  if (!topDir || !fs.existsSync(topDirAbsolute) || !fs.statSync(topDirAbsolute).isDirectory()) {
    failures.push(
      `존재하지 않는 최상위 디렉터리를 참조합니다: "${topDir}" (경로: ${rawPath})\n참조 위치: ${sourceDescription}\nfrontend/public 최상위 디렉터리:\n${PUBLIC_TOP_DIRS.join("\n")}`,
    )
    return
  }

  const absolute = path.join(PUBLIC_DIR, normalized)
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    failures.push(
      `public에 없는 에셋 경로입니다: ${rawPath}\n참조 위치: ${sourceDescription}\n찾은 곳: ${absolute}\n같은 폴더의 실제 파일:\n${describeDirectory(path.dirname(absolute))}`,
    )
  }
}

function assertNoFailures(failures, label) {
  assert.equal(failures.length, 0, `[${label}] ${failures.length}건 실패\n\n${failures.join("\n\n")}`)
}

// ---------------------------------------------------------------------------
// balanced-paren 호출 인자 추출 — publicAsset(fn(x)) 같은 중첩 호출도 정확히 자른다
// ---------------------------------------------------------------------------

function extractCallArgs(content, calleeName) {
  const results = []
  const calleeRe = new RegExp(`\\b${calleeName}\\s*\\(`, "g")
  let m
  while ((m = calleeRe.exec(content))) {
    const openParenIndex = m.index + m[0].length - 1
    let depth = 1
    let j = openParenIndex + 1
    while (j < content.length && depth > 0) {
      if (content[j] === "(") depth++
      else if (content[j] === ")") depth--
      j++
    }
    results.push({ argText: content.slice(openParenIndex + 1, j - 1).trim(), index: m.index })
  }
  return results
}

// ---------------------------------------------------------------------------
// 1) 일반 스캔 — 모든 .js/.jsx의 리터럴·정적 백틱·해석 가능한 동적 템플릿
// ---------------------------------------------------------------------------

/** 함수 파라미터 보간이 있어 텍스트 기반으로 못 푸는 템플릿이 사는 파일 — 아래 "동적 import
 *  실값 검증"에서 실제로 import해 계산된 값으로 별도 검증한다. 새 파일에서 같은 패턴이
 *  생기면(여기 없으면) 일반 스캔이 실패로 잡는다 — 조용히 넘어가지 않는다. */
const TEMPLATE_VERIFIED_BY_IMPORT_FILES = new Set(
  [
    "domains/store/constants/storeItems.js",
    "domains/user/constants/skinCardWear/skinCardWearCatalog.js",
    "domains/library/constants/forbiddenRecords/assets.js",
  ].map((rel) => path.join(SRC_DIR, ...rel.split("/"))),
)

const literalFailures = []
const unresolvedTemplateFailures = []
let literalCandidateCount = 0
let resolvedTemplateCandidateCount = 0

for (const file of SOURCE_FILES) {
  const content = fileContents.get(file)

  for (const lit of findStringLiterals(content)) {
    if (lit.quote !== "`") {
      const value = unescapeLiteral(lit.raw)
      if (looksLikeAssetPath(value)) {
        literalCandidateCount++
        checkAssetPathExists(value, relativeToSrc(file), literalFailures)
      }
      continue
    }

    const { parts, exprs } = splitTemplateLiteral(lit.raw)
    if (exprs.length === 0) {
      const value = unescapeLiteral(parts[0])
      if (looksLikeAssetPath(value)) {
        literalCandidateCount++
        checkAssetPathExists(value, relativeToSrc(file), literalFailures)
      }
      continue
    }

    const resolvedExprs = exprs.map((e) => resolveExprToLiteral(e, file))
    const tail = unescapeLiteral(parts[parts.length - 1])
    const joinedStatic = parts.map(unescapeLiteral).join("")
    const looksAssetShaped = MEDIA_TAIL_RE.test(tail) && joinedStatic.includes("/")

    if (resolvedExprs.every((v) => v !== null)) {
      const full = parts.reduce(
        (acc, part, idx) => acc + unescapeLiteral(part) + (resolvedExprs[idx] ?? ""),
        "",
      )
      if (looksLikeAssetPath(full)) {
        resolvedTemplateCandidateCount++
        checkAssetPathExists(full, relativeToSrc(file), literalFailures)
      }
      continue
    }

    if (!looksAssetShaped) continue // 에셋 경로 모양이 아닌 동적 템플릿(클래스명 등)은 대상 밖
    if (TEMPLATE_VERIFIED_BY_IMPORT_FILES.has(file)) continue // 아래에서 실값으로 별도 검증

    unresolvedTemplateFailures.push(
      `해석 불가한 동적 템플릿(에셋 경로로 보임): \`${lit.raw}\`\n참조 위치: ${relativeToSrc(file)}\n` +
        `보간(${exprs.length}개) 중 "같은 파일 최상위 const" 또는 "로컬/@ import된 파일의 최상위 const"로 ` +
        `해석되지 않는 것이 있습니다. 정적으로 풀 수 있게 고치거나, 함수 파라미터 보간이라 실행해야만 ` +
        `아는 값이면 TEMPLATE_VERIFIED_BY_IMPORT_FILES에 이 파일을 추가하고 아래 "동적 import 실값 검증"에 ` +
        `실제 export를 걷어 검사하는 로직을 추가하세요.`,
    )
  }
}

// ---------------------------------------------------------------------------
// 2) publicAsset(...) 호출 인자 분류 — 리터럴 / covered(상수 참조) / dynamic(허용목록 필요)
// ---------------------------------------------------------------------------

const MEMBER_CHAIN_RE =
  /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\[\]()]*\])*$/

function classifyCallArg(argText, file) {
  const trimmed = argText.trim()
  if (/^["'`]/.test(trimmed)) return { kind: "literal" }

  if (MEMBER_CHAIN_RE.test(trimmed)) {
    const rootIdent = trimmed.match(/^[A-Za-z_$][\w$]*/)[0]
    const content = fileContents.get(file)
    const hasTopLevelConst = content ? topLevelConstRegex(rootIdent).test(content) : false
    const importMap = parseImportMap(file)
    const importEntry = importMap.get(rootIdent)
    const isImportedLocal = Boolean(importEntry && importEntry.file)
    if (hasTopLevelConst || isImportedLocal) return { kind: "covered" }
  }

  return { kind: "dynamic" }
}

/** 정적으로 못 푸는 publicAsset(...) 인자 — 왜 안전한지 근거를 남겨야 등록할 수 있다.
 *  file은 SRC_DIR 기준 상대경로. 새 동적 인자가 생기면 여기 없는 한 테스트가 실패한다. */
const KNOWN_DYNAMIC_PUBLIC_ASSET_CALL_ARGS = [
  {
    file: "shared/ui/tutorialGuide/TutorialGuideOverlay.jsx",
    argText: "slides[pageIndex]",
    reason:
      "slides prop 기본값은 tutorialAssets.js의 TUTORIAL_GUIDE_SLIDES(이 파일의 일반 스캔이 검증)이고, " +
      "유일한 호출부 GeneralSettingsTab.jsx(<TutorialGuideOverlay open={...} onClose={...} />)는 " +
      "slides를 넘기지 않아 항상 기본값을 쓴다.",
  },
  {
    file: "shared/ui/Scrollbar.jsx",
    argText: "thumbSrc",
    reason:
      "thumbSrc prop 기본값은 customScrollbarAssets.js의 CUSTOM_SCROLLBAR_ASSETS.thumb(일반 스캔이 검증)이고, " +
      "repo 전체 5개 <Scrollbar> 호출부 모두 thumbSrc를 넘기지 않아 항상 기본값을 쓴다.",
  },
  {
    file: "shared/ui/PublicAsset.jsx",
    argText: "src",
    reason:
      "범용 래퍼 컴포넌트 — src는 기본값 없는 필수 prop이라 46개 호출부가 각자 값을 넘긴다. " +
      "표본 확인상 대부분 이 스캔이 검증하는 .js 상수 파일의 리터럴/템플릿이지만, 46개 호출부 전체를 " +
      "여기서 정적으로 열거해 증명하지는 않는다(알려진 한계 — AC-06 브라우저 확인으로 보완).",
  },
  {
    file: "domains/game/mode/components/ModeBackground.jsx",
    argText: "src",
    reason:
      "src prop 기본값은 modeAssets.js의 MODE_SCREEN_ASSETS.bg(일반 스캔이 검증)이고, " +
      "2개 호출부(MultiplayEntryPage.jsx, GameModePage.jsx) 모두 src를 넘기지 않아 항상 기본값을 쓴다.",
  },
  {
    file: "domains/game/result/components/GameResultShell.jsx",
    argText: "bgSrc",
    reason:
      'outcome("win"|"lose")로 GAME_RESULT_ASSETS.bgWin/bgLose(gameResultAssets.js, 일반 스캔이 검증) 중 ' +
      "하나만 고르는 삼항식의 결과를 담는 지역 변수 — outcome 값 자체가 경로 문자열에 들어가지 않는다.",
  },
  {
    file: "domains/game/result/components/GameResultIntroVideo.jsx",
    argText: "resolveGameResultIntroVideo(outcome)",
    reason:
      'resolveGameResultIntroVideo(gameResultAssets.js)는 outcome("win"|"lose")으로 ' +
      "GAME_RESULT_ASSETS.introWin/introLose(일반 스캔이 검증) 중 하나만 고르는 순수 2분기 조회 함수다 — " +
      "outcome 자체가 경로에 들어가지 않는다.",
  },
  {
    file: "domains/game/ingame/components/board/InGamePlayerFrameStroke.jsx",
    argText: "frameSrc",
    reason:
      "기본값·사망 상태 경로는 ingamePlayerAssets.js의 리터럴/템플릿(일반 스캔이 검증)이지만, " +
      "InGamePlayerBoard.jsx → useInGamePlayerSessionContext()를 거쳐 생존 플레이어의 player.frameSrc가 " +
      "그대로 흘러드는 경로가 있어 서버가 실제로 보내는 값까지는 정적으로 증명할 수 없다 " +
      "(알려진 한계 — AC-06 브라우저 확인으로 보완).",
  },
]

const allowlistKey = (file, argText) => `${file}::${argText}`
const allowlistMap = new Map(
  KNOWN_DYNAMIC_PUBLIC_ASSET_CALL_ARGS.map((entry) => [
    allowlistKey(entry.file, entry.argText),
    entry,
  ]),
)
const usedAllowlistKeys = new Set()

const callSiteFailures = []
let callSiteCount = 0

for (const file of SOURCE_FILES) {
  if (file === PUBLIC_ASSET_DEFINITION_FILE) continue
  const content = fileContents.get(file)
  const rel = relativeToSrc(file)

  for (const { argText } of extractCallArgs(content, "publicAsset")) {
    callSiteCount++
    const classification = classifyCallArg(argText, file)

    if (classification.kind === "literal") {
      const lit = readStringLiteralAt(argText, 0)
      let value = null
      if (lit.quote === "`") {
        const { parts, exprs } = splitTemplateLiteral(lit.raw)
        value = exprs.length === 0 ? unescapeLiteral(parts[0]) : null
      } else {
        value = unescapeLiteral(lit.raw)
      }
      if (value && looksLikeAssetPath(value)) {
        checkAssetPathExists(value, `${rel} (publicAsset 호출 인자)`, callSiteFailures)
      }
      continue
    }

    if (classification.kind === "covered") continue

    const key = allowlistKey(rel, argText)
    if (allowlistMap.has(key)) {
      usedAllowlistKeys.add(key)
      continue
    }

    callSiteFailures.push(
      `publicAsset(${argText}) — 정적으로 해석할 수 없는 호출 인자입니다.\n참조 위치: ${rel}\n` +
        `이 인자가 실제로 항상 리터럴/상수로 귀결됨을 확인했다면 KNOWN_DYNAMIC_PUBLIC_ASSET_CALL_ARGS에 ` +
        `{ file: ${JSON.stringify(rel)}, argText: ${JSON.stringify(argText)}, reason: "..." } 항목을 추가하세요. ` +
        `그렇지 않다면(진짜 런타임 값) 이 참조는 정적으로 검증할 수 없다는 뜻이므로 별도 수동 확인이 필요합니다.`,
    )
  }
}

// ---------------------------------------------------------------------------
// 3) 동적 import 실값 검증 — 함수 파라미터 보간은 Node가 실제로 실행한 값으로 검사한다
// ---------------------------------------------------------------------------

function collectStringLeaves(value, out = [], depth = 0, seen = new Set()) {
  if (depth > 8 || value == null) return out
  if (typeof value === "string") {
    out.push(value)
    return out
  }
  if (typeof value !== "object") return out
  if (seen.has(value)) return out
  seen.add(value)

  if (Array.isArray(value)) {
    for (const item of value) collectStringLeaves(item, out, depth + 1, seen)
  } else {
    for (const v of Object.values(value)) collectStringLeaves(v, out, depth + 1, seen)
  }
  return out
}

const dynamicImportFailures = []
let dynamicImportAssetCount = 0

{
  const targets = [
    "domains/store/constants/storeItems.js",
    "domains/user/constants/skinCardWear/skinCardWearCatalog.js",
  ].map((rel) => path.join(SRC_DIR, ...rel.split("/")))

  for (const file of targets) {
    let moduleNs
    try {
      moduleNs = await import(pathToFileURL(file).href)
    } catch (err) {
      dynamicImportFailures.push(
        `동적 import 실패: ${relativeToSrc(file)} — ${err.message}\n이 파일은 함수 파라미터 보간 경로가 ` +
          `있어 실제 실행값 검증이 필요한데 import 자체가 실패했다. 원인을 고치거나 이 파일을 ` +
          `TEMPLATE_VERIFIED_BY_IMPORT_FILES에서 빼고 다른 방식으로 검증하세요.`,
      )
      continue
    }

    const assetPaths = collectStringLeaves(moduleNs).filter(looksLikeAssetPath)
    if (assetPaths.length === 0) {
      dynamicImportFailures.push(
        `${relativeToSrc(file)}의 export에서 에셋 경로 문자열을 하나도 못 찾았다 — 검증 로직이 깨졌을 수 있다.`,
      )
      continue
    }
    dynamicImportAssetCount += assetPaths.length
    for (const p of assetPaths) {
      checkAssetPathExists(p, `${relativeToSrc(file)} (동적 import로 계산된 실값)`, dynamicImportFailures)
    }
  }
}

const forbiddenRecordsFailures = []
{
  const file = path.join(
    SRC_DIR,
    "domains",
    "library",
    "constants",
    "forbiddenRecords",
    "assets.js",
  )
  try {
    const moduleNs = await import(pathToFileURL(file).href)
    if (typeof moduleNs.getForbiddenRecordsChallengeClearIllust !== "function") {
      forbiddenRecordsFailures.push(
        `${relativeToSrc(file)}에 getForbiddenRecordsChallengeClearIllust 함수 export가 없다 — ` +
          `함수 이름이 바뀌었으면 이 테스트도 같이 고쳐야 한다.`,
      )
    } else {
      // 소스 주석: "1-based spread 번호 (1~7)" — 그 범위를 그대로 실행해 실제 값을 검사한다.
      for (let page = 1; page <= 7; page++) {
        const value = moduleNs.getForbiddenRecordsChallengeClearIllust(page)
        checkAssetPathExists(
          value,
          `${relativeToSrc(file)}:getForbiddenRecordsChallengeClearIllust(${page})`,
          forbiddenRecordsFailures,
        )
      }
    }
  } catch (err) {
    forbiddenRecordsFailures.push(`동적 import 실패: ${relativeToSrc(file)} — ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

test("frontend/public 디렉터리를 찾는다", () => {
  assert.ok(fs.existsSync(PUBLIC_DIR), `public 디렉터리가 없다: ${PUBLIC_DIR}`)
  assert.ok(PUBLIC_TOP_DIRS.length > 0)
})

test("스캔이 실제로 publicAsset(...) 호출과 리터럴/템플릿 에셋 경로를 찾아낸다", () => {
  assert.ok(callSiteCount > 0, "publicAsset(...) 호출을 하나도 못 찾았다 — 스캔이 깨졌을 수 있다")
  assert.ok(literalCandidateCount > 0, "리터럴 에셋 경로를 하나도 못 찾았다 — 스캔이 깨졌을 수 있다")
  assert.ok(
    resolvedTemplateCandidateCount > 0,
    "해석된 동적 템플릿(예: `${DIR}/x.png`)을 하나도 못 찾았다 — DIR-상수 보간 스캔이 깨졌을 수 있다",
  )
})

test("frontend/src의 리터럴·정적 백틱·해석된 동적 템플릿 에셋 경로가 모두 frontend/public에 존재한다", () => {
  assertNoFailures(literalFailures, "일반 스캔")
})

test("함수 파라미터 보간이라 정적으로 못 푸는 템플릿은 TEMPLATE_VERIFIED_BY_IMPORT_FILES 3개 파일에만 있다", () => {
  assertNoFailures(unresolvedTemplateFailures, "해석 불가 동적 템플릿")
})

test("publicAsset(...) 호출 인자 — 리터럴과 covered 인자가 참조하는 경로가 모두 존재한다", () => {
  assertNoFailures(callSiteFailures, "publicAsset 호출 인자")
})

test("KNOWN_DYNAMIC_PUBLIC_ASSET_CALL_ARGS에 죽은(더 이상 해당 호출부가 없는) 항목이 없다", () => {
  const stale = KNOWN_DYNAMIC_PUBLIC_ASSET_CALL_ARGS.filter(
    (entry) => !usedAllowlistKeys.has(allowlistKey(entry.file, entry.argText)),
  )
  assert.deepEqual(
    stale,
    [],
    `호출부가 사라졌거나 코드가 바뀌어 더 이상 매치되지 않는 허용목록 항목이 있다 — 지우거나 argText를 맞추세요:\n${JSON.stringify(stale, null, 2)}`,
  )
})

test("storeItems.js / skinCardWearCatalog.js — 함수 파라미터 보간 경로를 실제 import로 계산해 검증한다", () => {
  assert.ok(dynamicImportAssetCount > 0, "동적 import에서 에셋 경로 문자열을 하나도 못 찾았다")
  assertNoFailures(dynamicImportFailures, "동적 import 실값")
})

test("forbiddenRecords/assets.js — getForbiddenRecordsChallengeClearIllust(1~7) 실값을 검증한다", () => {
  assertNoFailures(forbiddenRecordsFailures, "forbiddenRecords 실값")
})

// --- 아래는 위 4가지 수정이 실제로 동작함을 코드베이스 상태와 무관하게 증명하는 합성 테스트 ---

test("[합성] 존재하지 않는 최상위 디렉터리 참조는 조용히 무시되지 않고 실패로 잡힌다", () => {
  const failures = []
  checkAssetPathExists("/이런디렉터리는없다/x.png", "synthetic", failures)
  assert.equal(failures.length, 1)
  assert.match(failures[0], /존재하지 않는 최상위 디렉터리/)
})

function findAnyMediaFileRelativeToPublic(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findAnyMediaFileRelativeToPublic(full)
      if (found) return found
    } else if (MEDIA_TAIL_RE.test(entry.name)) {
      return path.relative(PUBLIC_DIR, full).split(path.sep).join("/")
    }
  }
  return null
}

test("[합성] 선행 슬래시가 없는 경로도 존재 여부가 정상적으로 검사된다", () => {
  const sampleRelPath = findAnyMediaFileRelativeToPublic(PUBLIC_DIR)
  assert.ok(sampleRelPath, "테스트를 위해 frontend/public 아래 미디어 파일이 최소 1개 필요하다")
  const sampleTopDir = sampleRelPath.split("/")[0]

  const hit = []
  checkAssetPathExists(sampleRelPath, "synthetic (no leading slash, existing)", hit)
  assert.equal(hit.length, 0, hit.join("\n"))

  const miss = []
  checkAssetPathExists(`${sampleTopDir}/이런파일은없다.png`, "synthetic (no leading slash, missing)", miss)
  assert.equal(miss.length, 1)
  assert.match(miss[0], /public에 없는 에셋 경로/)
})

test("[합성] 정적 백틱 리터럴(보간 없음)도 문자열 리터럴로 식별된다", () => {
  const content = "const X = `/frame/x.png`\n"
  const literals = findStringLiterals(content)
  assert.equal(literals.length, 1)
  assert.equal(literals[0].quote, "`")
  const { exprs } = splitTemplateLiteral(literals[0].raw)
  assert.equal(exprs.length, 0)
})

test("[합성] 중첩 호출이 있어도 publicAsset(...) 인자를 정확히 추출한다", () => {
  const content = "const x = publicAsset(resolveGameResultIntroVideo(outcome))"
  const [call] = extractCallArgs(content, "publicAsset")
  assert.ok(call, "중첩 호출이 있는 publicAsset(...)를 아예 못 찾았다")
  assert.equal(call.argText, "resolveGameResultIntroVideo(outcome)")
})

test("[합성] 상수/import에 뿌리를 두지 않은 publicAsset(...) 인자는 dynamic으로 분류된다(허용목록 없으면 실패 대상)", () => {
  const file = path.join(SRC_DIR, "domains", "game", "result", "components", "GameResultShell.jsx")
  const classification = classifyCallArg("someRuntimeOnlyLocalVariable", file)
  assert.equal(classification.kind, "dynamic")
})
