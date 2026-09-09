/**
 * frontend/src 전체에서 publicAsset(...) 호출과 에셋 상수가 참조하는 public 경로를
 * 모두 모아 frontend/public에 실제로 존재하는지 검사합니다.
 *
 * __tests__ 디렉터리·*.test.js는 스캔에서 뺀다 — 목(mock) 값으로 존재하지 않는 경로를
 * 일부러 쓰는 테스트가 있어서(예: profileCustomization.store.test.js의 임의 photoSrc),
 * 그 값들을 "실제 에셋 참조"로 검증하면 거짓 실패가 난다.
 *
 * publicAsset(...) 호출 인자는 거의 모두 상수 객체 프로퍼티나 지역 변수(prop 전달)라서
 * 그 자체로는 리터럴이 아니다. 실제 경로 문자열은 어딘가의 상수 파일에 리터럴로 적혀
 * 있어야 앱이 동작하므로, 같은 스캔(리터럴 경로 수집)이 그 값도 함께 잡아낸다. 이 스캔이
 * 잡을 수 없는 경우는 템플릿 리터럴 보간(`${}`)이나 문자열 접합(+)으로 경로를 조립하는
 * 경우뿐이라, 그런 호출만 따로 "해석 불가"로 보고한다.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
// __tests__ → utils → shared → src
const SRC_DIR = path.resolve(HERE, "..", "..", "..")
// src → frontend → public
const PUBLIC_DIR = path.resolve(HERE, "..", "..", "..", "..", "public")

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

const SOURCE_FILES = walk(SRC_DIR)

const PUBLIC_TOP_DIRS = fs
  .readdirSync(PUBLIC_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const ASSET_PATH_RE = new RegExp(
  `(["'])\\/(${PUBLIC_TOP_DIRS.join("|")})\\/([^"'\\\\]+?\\.(?:png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|ogg))\\1`,
  "g",
)

/** file → Set<path> (리터럴로 발견된 에셋 경로) */
const literalPathsByFile = new Map()

for (const file of SOURCE_FILES) {
  const content = stripComments(fs.readFileSync(file, "utf8"))
  const found = new Set()

  for (const match of content.matchAll(ASSET_PATH_RE)) {
    found.add(`/${match[2]}/${match[3]}`)
  }

  if (found.size > 0) literalPathsByFile.set(file, found)
}

/** file → [{ argText }] (publicAsset(...) 호출의 원문 인자) */
const callSitesByFile = new Map()
const PUBLIC_ASSET_DEFINITION_FILE = path.join(SRC_DIR, "shared", "utils", "publicAsset.js")
const CALL_RE = /publicAsset\(\s*([^()]*?)\s*\)/g

for (const file of SOURCE_FILES) {
  if (file === PUBLIC_ASSET_DEFINITION_FILE) continue

  const content = stripComments(fs.readFileSync(file, "utf8"))
  const sites = [...content.matchAll(CALL_RE)].map((match) => match[1])

  if (sites.length > 0) callSitesByFile.set(file, sites)
}

function relativeToSrc(file) {
  return path.relative(SRC_DIR, file).split(path.sep).join("/")
}

function describeDirectory(dir) {
  if (!fs.existsSync(dir)) return `(디렉터리 없음: ${dir})`
  return fs.readdirSync(dir).join("\n")
}

function assertPublicPathExists(assetPath, sourceDescription) {
  const normalized = assetPath.normalize("NFC")
  const absolute = path.join(PUBLIC_DIR, normalized)

  assert.ok(
    fs.existsSync(absolute) && fs.statSync(absolute).isFile(),
    `public에 없는 에셋 경로입니다: ${assetPath}\n참조 위치: ${sourceDescription}\n찾은 곳: ${absolute}\n같은 폴더의 실제 파일:\n${describeDirectory(path.dirname(absolute))}`,
  )
}

test("frontend/public 디렉터리를 찾는다", () => {
  assert.ok(fs.existsSync(PUBLIC_DIR), `public 디렉터리가 없다: ${PUBLIC_DIR}`)
  assert.ok(PUBLIC_TOP_DIRS.length > 0)
})

test("스캔이 실제로 publicAsset(...) 호출과 리터럴 에셋 경로를 찾아낸다", () => {
  assert.ok(callSitesByFile.size > 0, "publicAsset(...) 호출을 하나도 못 찾았다 — 스캔 정규식이 깨졌을 수 있다")
  assert.ok(literalPathsByFile.size > 0, "리터럴 에셋 경로를 하나도 못 찾았다 — 스캔 정규식이 깨졌을 수 있다")
})

test("frontend/src의 리터럴 에셋 경로가 모두 frontend/public에 존재한다", () => {
  for (const [file, paths] of literalPathsByFile) {
    for (const assetPath of paths) {
      assertPublicPathExists(assetPath, relativeToSrc(file))
    }
  }
})

test("publicAsset(...) 호출 인자가 템플릿 보간·문자열 접합으로 경로를 조립하지 않는다(해석 불가 참조 없음)", () => {
  const unresolved = []

  for (const [file, sites] of callSitesByFile) {
    for (const argText of sites) {
      const isDynamicTemplate = /`[^`]*\$\{/.test(argText)
      const isConcatenation = /["'`]\s*\+|\+\s*["'`]/.test(argText)

      if (isDynamicTemplate || isConcatenation) {
        unresolved.push(`${relativeToSrc(file)}: publicAsset(${argText})`)
      }
    }
  }

  assert.deepEqual(
    unresolved,
    [],
    `리터럴 스캔으로 존재를 확인할 수 없는 동적 경로 조립이 있다 — 실제 경로를 확인하고 이 테스트에 알려라:\n${unresolved.join("\n")}`,
  )
})
