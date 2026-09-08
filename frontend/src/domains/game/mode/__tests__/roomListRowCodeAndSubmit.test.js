/**
 * UI-08 이식분 고정 테스트.
 *
 * - AC-01: 이식 대상 9개 파일이 모두 존재하고, 경로 별칭(@/) import가 남아 있지 않으며,
 *          원격 본문과의 차이가 허용된 것(별칭 치환·주석·로컬 계약)뿐이다.
 *          여기서 "허용된 차이"는 다음 넷 중 하나로만 인정한다.
 *            (a) 주석·빈 줄
 *            (b) import: 가져오는 이름과 가리키는 파일이 상대편과 같은 것 — 즉 차이가 경로
 *                치환뿐인 것. 이름이 늘거나 새 import가 생기면 (d)로 설명해야 한다.
 *            (c) 같은 hunk 안에서 내용이 같고 들여쓰기만 다른 줄과 1:1로 짝지어지는 줄
 *            (d) 파일별 로컬 계약 허용 목록에 이유와 함께 적힌 줄, 그리고 그 줄이 연 블록
 *          "상대편 파일 어딘가에 같은 문자열이 있으면 면제"나 "import 줄은 전부 면제" 같은
 *          넓은 예외를 두지 않는다 — 그런 예외는 실제 계약 차이(예: 새 import, 새로 추가된
 *          마크업 한 줄)까지 함께 통과시켜 이 테스트가 아무것도 고정하지 못하게 만든다.
 * - AC-02: 이식한 컴포넌트가 라우트 → 페이지 → 부모 → 자식으로 실제 화면 트리에 이어져 있다.
 * - AC-03: 지정된 5개 테스트가 npm test의 실행 대상 집합에 실제로 들어 있다.
 * - AC-04: 방 목록 행이 방 코드를 표시하고, 방코드 입력이 로컬 훅의 정규화 결과를 제출한다.
 *
 * 이 저장소의 테스트는 `node --test`로 돌고 JSX를 변환하지 않으므로 .jsx는 import할 수 없다
 * (frontend/package.json의 test 스크립트). 그래서 화면 파일은 이미 저장소에 있는 방식
 * (app/routes/__tests__/podiumRoute.test.js와 동일)으로 소스 문자열을 읽어 연결을 확인하고,
 * 값이 실제로 어떻게 변하는지는 진짜 훅(useRoomCodeInput)을 렌더링해 확인한다.
 * 두 방식을 잇기 위해, 아래 하니스가 재현하는 연결(칸 value·onChange·제출 가드)이 실제
 * RoomCodeInput·RoomInvitePage·useRoomInvitePage 소스와 같은지도 함께 고정한다.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createElement, useState } from "react"
import { JSDOM } from "jsdom"

import {
  ROOM_LIST_ROW_FRAME_CLASS,
  ROOM_LIST_ROW_FRAME_SELECTED_CLASS,
  ROOM_LIST_ROW_LOCK_BADGE_CLASS,
} from "../constants/roomListLayout.js"
import { resolveRoomListRowCode } from "../utils/resolveRoomListRowCode.js"
import { ROOM_CODE_LENGTH } from "../../matching/utils/roomCode.js"

const here = path.dirname(fileURLToPath(import.meta.url))
// frontend/src (이 파일: src/domains/game/mode/__tests__/)
const srcRoot = path.resolve(here, "..", "..", "..", "..")
// 저장소 최상위 (frontend/src → frontend → repo)
const repoRoot = path.resolve(srcRoot, "..", "..")

/** frontend/src 기준 경로의 파일 본문을 읽는다. */
function readSrc(relativePath) {
  return readFileSync(path.join(srcRoot, relativePath), "utf8")
}

/** 파일 본문이 주어진 패턴을 모두 담고 있는지 확인한다(연결 근거). */
function assertWires(relativePath, patterns) {
  const source = readSrc(relativePath)
  for (const [pattern, why] of patterns) {
    assert.match(source, pattern, `${relativePath}: ${why}`)
  }
}

const roomListRowSource = readSrc("domains/game/mode/components/roomList/RoomListRow.jsx")

// ── AC-01: 이식 대상 파일의 존재와 경로 별칭 제거 ────────────────────────────

/** UI-08에서 원격 표현을 가져오기로 한 파일들(요구사항의 예상 범위). */
const PORTED_FILES = [
  "domains/game/mode/components/roomList/RoomListRow.jsx",
  "domains/game/mode/components/roomList/RoomListShell.jsx",
  "domains/game/mode/components/RoomCodeInput.jsx",
  "domains/game/mode/pages/MultiplayEntryPage.jsx",
  "domains/game/matching/components/RoomCodeViewModal.jsx",
  "domains/game/setup/components/GameSetupPanel.jsx",
  "domains/game/setup/components/RoleCompositionSection.jsx",
  "domains/game/mode/constants/roomListLayout.js",
  "domains/game/setup/hooks/useSetupContentScrollOnRoleModeChange.js",
]

test("AC-01: 이식 대상 9개 파일이 모두 존재한다", () => {
  assert.equal(PORTED_FILES.length, 9)
  for (const relativePath of PORTED_FILES) {
    assert.ok(existsSync(path.join(srcRoot, relativePath)), `없는 파일: ${relativePath}`)
  }
})

test("AC-01: 이식한 파일에는 경로 별칭(@/) import가 남아 있지 않다", () => {
  // 이 파일들의 import 체인은 node --test에서 그대로 따라갈 수 있어야 한다 —
  // 별칭은 vite만 해석하므로 하나라도 남으면 순수 JS 테스트가 체인 중간에서 끊긴다.
  for (const relativePath of PORTED_FILES) {
    const source = readSrc(relativePath)
    assert.ok(
      !/\bfrom\s+["']@\//.test(source) && !/\bimport\s+["']@\//.test(source),
      `@/ 별칭 import가 남아 있다: ${relativePath}`,
    )
  }
})

// ── AC-01: 원격 본문과의 차이가 허용된 것뿐인지 ───────────────────────────────
//
// "허용된 차이"는 요구사항이 정한 세 가지다.
//   (1) 경로 별칭(@/) → 상대 경로 치환
//   (2) 로컬 훅·API 계약을 유지하기 위해 필요한 부분 — 파일별로 아래에 이유와 함께 적는다
//   (3) 그 이유를 적은 주석
// 이 테스트는 원격 본문을 직접 읽어(git show/diff) 바뀐 줄을 한 줄씩 위 셋 중 하나로
// 분류하고, 어디에도 속하지 않는 줄이 하나라도 남으면 그 줄을 그대로 찍고 실패한다.

const REMOTE_REF = "origin/feature/ui-Phase1complete"

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
}

/** 원격 ref가 이 저장소에 있는지 — 없으면 비교 근거를 만들 수 없으므로 그대로 실패시킨다. */
function assertRemoteRefExists() {
  let resolved = ""
  try {
    resolved = git(["rev-parse", "--verify", `${REMOTE_REF}^{commit}`]).trim()
  } catch (error) {
    assert.fail(`원격 비교 대상(${REMOTE_REF})을 찾지 못해 차이를 확인할 수 없다: ${error.message}`)
  }
  assert.match(resolved, /^[0-9a-f]{40}$/, `${REMOTE_REF}가 커밋을 가리키지 않는다`)
}

/**
 * 별칭(@/)·상대 경로를 "frontend/src 기준 경로" 하나로 맞춘다. 확장자는 비교에서 뺀다 —
 * 별칭을 상대 경로로 바꿀 때 node가 해석할 수 있도록 `.jsx`를 붙인 곳이 있기 때문이다
 * (예: 원격 `@/shared/ui/PublicAsset` → 로컬 `../../../../shared/ui/PublicAsset.jsx`).
 * 패키지 이름(react 등)은 그대로 둔다.
 */
function resolveModuleTarget(module, fileRelativeToSrc) {
  const posixFile = fileRelativeToSrc.split(path.sep).join("/")
  if (module.startsWith("@/")) return module.slice(2)
  if (module.startsWith(".")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(posixFile), module))
  }
  return module
}

const withoutExtension = (target) => target.replace(/\.jsx?$/, "")

/**
 * import 문 하나를 "무엇을(clause) 어디에서(module)"로 쪼갠다.
 * key는 그 둘만으로 만든다 — 별칭이든 상대 경로든 같은 파일에서 같은 이름을 가져오면 같은 key다.
 * 즉 key가 같으면 그 import의 차이는 경로 치환뿐이고, key가 다르면 가져오는 대상이 실제로 달라졌다.
 */
function makeImportStatement(text, fileRelativeToSrc) {
  const module = text.match(/["']([^"']+)["']\s*$/)?.[1] ?? ""
  const clause = text
    .replace(/^import\s*/, "")
    .replace(/\s*from\s*["'][^"']+["']\s*$/, "")
    .replace(/^["'][^"']+["']$/, "") // side-effect import(`import "…"`)는 가져오는 이름이 없다
    .trim()
  const target = resolveModuleTarget(module, fileRelativeToSrc)

  return { text, module, clause, target, key: `${clause}|${withoutExtension(target)}` }
}

/**
 * 파일 안의 import를 문장 단위로 모은다. 여러 줄로 쓴 `import { … } from "…"`는 한 문장으로
 * 합쳐서 판정한다 — 줄 단위로 보면 `import {` 나 멤버 한 줄만 떼어 보게 돼 무엇이 달라졌는지
 * 알 수 없기 때문이다.
 * 반환: byLine(줄 번호 → 문장 번호), statements(문장 목록)
 */
function collectImports(source, fileRelativeToSrc) {
  const byLine = new Map()
  const statements = []
  let pending = null

  source.split("\n").forEach((raw, index) => {
    const lineNumber = index + 1
    const line = raw.trim()

    if (!pending) {
      if (!/^import\b/.test(line)) return
      pending = { lines: [line], numbers: [lineNumber] }
    } else {
      pending.lines.push(line)
      pending.numbers.push(lineNumber)
    }

    // `from "…"`(또는 side-effect import)가 나오기 전까지는 같은 문장이 이어진다.
    const ends = /\bfrom\s+["'][^"']+["']/.test(line) || /^import\s+["'][^"']+["']/.test(line)
    if (!ends) return

    const text = pending.lines
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/,\s*\}/g, " }") // 여러 줄 import의 마지막 쉼표는 한 줄로 쓸 때 사라진다
      .trim()
    const statementIndex = statements.length
    for (const number of pending.numbers) byLine.set(number, statementIndex)
    statements.push(makeImportStatement(text, fileRelativeToSrc))
    pending = null
  })

  return { byLine, statements }
}

/** `git diff -U0`을 읽어 hunk별로 사라진 줄·새로 생긴 줄을 줄 번호와 함께 모은다. */
function diffHunksAgainstRemote(repoRelativePath) {
  const output = git(["diff", "-U0", REMOTE_REF, "--", repoRelativePath])
  const hunks = []
  let hunk = null
  let oldLine = 0
  let newLine = 0

  for (const raw of output.split("\n")) {
    const line = raw.replace(/\r$/, "")
    const header = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[2])
      hunk = { added: [], removed: [] }
      hunks.push(hunk)
      continue
    }
    if (!hunk) continue // @@ 앞의 ---/+++ 등 파일 머리말
    if (line.startsWith("+")) {
      hunk.added.push({ lineNumber: newLine, text: line.slice(1) })
      newLine += 1
      continue
    }
    if (line.startsWith("-")) {
      hunk.removed.push({ lineNumber: oldLine, text: line.slice(1) })
      oldLine += 1
    }
  }

  return hunks
}

/**
 * 같은 hunk 안에서 "내용은 그대로고 들여쓰기만 바뀐" 줄끼리 1:1로 짝지어 표시한다
 * (fragment로 감싸면서 한 단계 밀린 마크업이 여기 해당한다).
 *
 * 짝짓기를 hunk 안으로 한정하고 1:1로 소비하는 이유는, "상대편 어딘가에 같은 문자열이 있으면
 * 면제"로 두면 흔한 한 줄(`/>`, `</span>`)이 파일 어디에나 있어서 실제 추가·삭제까지 함께
 * 빠져나가기 때문이다. 들여쓰기까지 똑같은 줄은 짝짓지 않는다 — 그건 밀린 줄이 아니라 자리를
 * 옮긴 줄이라 따로 설명해야 한다.
 */
function markReindentedLines(hunk) {
  const reindented = new Set()
  const removedByText = new Map()

  for (const entry of hunk.removed) {
    const key = entry.text.trim()
    if (!removedByText.has(key)) removedByText.set(key, [])
    removedByText.get(key).push(entry)
  }

  for (const entry of hunk.added) {
    const candidates = removedByText.get(entry.text.trim())
    if (!candidates?.length) continue
    const matchIndex = candidates.findIndex((removed) => removed.text !== entry.text)
    if (matchIndex === -1) continue

    const [removed] = candidates.splice(matchIndex, 1)
    reindented.add(`+${entry.lineNumber}`)
    reindented.add(`-${removed.lineNumber}`)
  }

  return reindented
}

/**
 * 파일별로 "로컬 훅·API 계약을 지키느라 원격과 달라진" 줄과 그 이유다.
 * 여기 적히지 않은 변경은 이 테스트에서 그대로 실패한다.
 *
 * 패턴을 대는 대상은 두 가지다.
 *  - import 줄: 여러 줄로 쓴 import를 한 줄로 합친 문장 전체(`import { A, B } from "…"`)
 *  - 그 밖의 줄: trim한 줄 하나
 * 여기서 설명된 줄이 블록을 열면(`{`·`(`가 남으면) 그 블록이 닫힐 때까지가 같은 문장으로
 * 함께 설명된 것으로 본다 — 설명된 변경이 여러 줄로 늘어나며 생긴 닫는 줄까지 일일이
 * 패턴으로 적게 하면, 정작 무엇이 달라졌는지가 목록에서 안 보이기 때문이다.
 */
const ALLOWED_LOCAL_CONTRACT_DIFFS = {
  "domains/game/mode/components/roomList/RoomListRow.jsx": [
    [/^const \{ stage, current, max, title/, "AC-04: 코드 표시를 room 객체 전체로 계산한다"],
    [
      /rowCode|resolveRoomListRowCode|isCode|accessType/,
      "AC-04: 코드 방 배지가 고정 문구 대신 방 코드 값을 표시한다",
    ],
  ],
  "domains/game/mode/components/roomList/RoomListShell.jsx": [
    [
      /selectedRoom|onEnterRoom|onJoinByCode/,
      "로컬 입장 계약: 코드 방은 버튼을 잠그는 대신 코드 입력 화면으로 방 id를 넘긴다",
    ],
    [/"코드 (필요|입력)"/, "같은 계약: 코드 방 입장 버튼 라벨"],
  ],
  "domains/game/mode/components/RoomCodeInput.jsx": [
    [
      /^import \{ (ROOM_CODE_INPUT_ATTRIBUTES, )?useRoomCodeInput \} from "[^"]*useRoomCodeInput\.js"$/,
      "로컬 훅 계약: 원격은 훅만 가져왔지만 여기서는 칸 속성 상수도 같은 훅에서 가져온다",
    ],
    [
      /ROOM_CODE_INPUT_ATTRIBUTES/,
      "로컬 훅 계약: 칸 속성의 출처를 useRoomCodeInput 한곳으로 유지한다",
    ],
    [
      /^(type|inputMode|autoComplete|autoCorrect|autoCapitalize|spellCheck|maxLength)=/,
      "같은 계약: 화면에 흩어져 있던 인라인 속성을 훅의 상수로 대체했다",
    ],
  ],
  "domains/game/mode/pages/MultiplayEntryPage.jsx": [
    [
      /onJoinByCode|navigate\("\/roomInvite"/,
      "로컬 입장 계약: 목록에서 고른 코드 방의 id를 코드 입력 화면으로 전달한다",
    ],
  ],
  "domains/game/matching/components/RoomCodeViewModal.jsx": [
    [
      /^import \{ (useId, )?useRef, useState \} from "react"$/,
      "로컬 복사 계약: 복사 오류 문구와 복사 버튼을 잇는 id를 useId로 만든다",
    ],
    [
      /resolveRoomCodeCopy|normalizeRoomCode|displayRoomCode|ROOM_CODE_COPY_ERRORS|outcome/,
      "로컬 복사 계약: 복사 가능 여부 판정을 utils/roomCode.js에 맡긴다",
    ],
    [
      /[cC]opyError|COPY_ERROR_CLASS|role="alert"|aria-describedby|^<\/p>$/,
      "같은 계약: 복사 실패 사유를 role=alert 영역으로 읽어준다",
    ],
    [/^return$/, "같은 계약: 복사할 수 없는 상태면 클립보드를 건드리지 않고 빠져나온다"],
    [/copyFeedbackTimerRef|clearCopyFeedbackTimer|setCopied\(false\)/, "같은 계약: 복사 피드백 타이머 정리"],
    [/clipboard\.writeText|value=\{roomCode\}/, "같은 계약: 표시값과 복사값을 같은 문자열에서 낸다"],
    [/^<\/?>$/, "같은 계약: 복사 버튼과 오류 문구를 함께 담기 위한 fragment"],
    [
      /^<\/span>$/,
      "같은 계약: fragment로 감싸며 마크업이 밀려 닫는 </span>가 짝과 다른 hunk로 갈라졌다" +
        " — 개수가 원격과 같다는 것은 아래 '마크업 구조는 원격과 같다' 테스트가 확인한다",
    ],
  ],
  "domains/game/setup/components/GameSetupPanel.jsx": [],
  "domains/game/setup/components/RoleCompositionSection.jsx": [],
  "domains/game/mode/constants/roomListLayout.js": [],
  "domains/game/setup/hooks/useSetupContentScrollOnRoleModeChange.js": [],
}

/**
 * 그 줄에서 열린 채로 남은 괄호 수다(`{`·`(`는 +1, `}`·`)`는 -1).
 *
 * 설명된 변경이 블록을 열면 그 블록이 닫힐 때까지를 같은 문장으로 본다. 문자열 안의 괄호까지
 * 세는 거친 계산이지만, 이 셈이 어긋나 봐야 면제가 일찍 끝나(=설명되지 않은 줄로 보고됨)
 * 실패하는 쪽이라 판정을 느슨하게 만들지 않는다. 면제는 깊이가 0으로 돌아오면 반드시 끝난다.
 */
function openBracketDelta(text) {
  const opened = (text.match(/[({]/g) ?? []).length
  const closed = (text.match(/[)}]/g) ?? []).length
  return opened - closed
}

/** 주석·빈 줄인지. 여러 줄 주석은 앞뒤 줄을 이어 봐야 하므로 상태를 들고 판정한다. */
function makeCommentClassifier() {
  let inBlockComment = false

  return (text) => {
    const line = text.trim()
    if (inBlockComment) {
      if (line.includes("*/")) inBlockComment = false
      return true
    }
    if (line === "") return true
    if (line.startsWith("//")) return true
    if (line.startsWith("*")) return true
    if (line.startsWith("/*") || line.startsWith("{/*")) {
      inBlockComment = !line.includes("*/")
      return true
    }
    return false
  }
}

test("AC-01: 이식한 9개 파일의 원격 대비 차이는 허용된 것뿐이다", () => {
  assertRemoteRefExists()

  const unexplained = []
  const usedReasons = new Set()

  for (const relativePath of PORTED_FILES) {
    const repoRelativePath = `frontend/src/${relativePath}`
    const localSource = readSrc(relativePath)
    const remoteSource = git(["show", `${REMOTE_REF}:${repoRelativePath}`])
    const hunks = diffHunksAgainstRemote(repoRelativePath)

    const allowed = ALLOWED_LOCAL_CONTRACT_DIFFS[relativePath]
    assert.ok(allowed, `허용 목록에 없는 파일이다: ${relativePath}`)

    const localImports = collectImports(localSource, relativePath)
    const remoteImports = collectImports(remoteSource, relativePath)
    const localKeys = new Set(localImports.statements.map((statement) => statement.key))
    const remoteKeys = new Set(remoteImports.statements.map((statement) => statement.key))

    const sides = [
      { sign: "+", pick: (hunk) => hunk.added, imports: localImports, counterpartKeys: remoteKeys },
      { sign: "-", pick: (hunk) => hunk.removed, imports: remoteImports, counterpartKeys: localKeys },
    ]

    for (const { sign, pick, imports, counterpartKeys } of sides) {
      const isComment = makeCommentClassifier()
      // 여러 줄로 쓴 대입문(`const X =` 다음 줄에 값)은 앞 줄과 한 몸이라 함께 판정한다.
      let previousLineContinues = false
      // 설명된 줄이 연 블록이 아직 닫히지 않은 만큼(닫히면 면제도 끝난다).
      let openDepth = 0
      // 여러 줄 import는 문장 하나로 보고하므로, 같은 문장을 줄 수만큼 찍지 않는다.
      const reportedStatements = new Set()

      for (const hunk of hunks) {
        const reindented = markReindentedLines(hunk)

        for (const { lineNumber, text } of pick(hunk)) {
          const trimmed = text.trim()
          const continuesAllowedStatement = previousLineContinues || openDepth > 0
          previousLineContinues = false

          if (isComment(text)) continue

          // import는 줄이 아니라 문장으로 판정한다. 상대편에 "같은 이름을 같은 파일에서"
          // 가져오는 import가 있으면 그 차이는 별칭→상대 경로 치환뿐이다. 가져오는 대상이
          // 실제로 달라졌으면(이름 추가·새 import) 아래 허용 목록에 이유가 있어야 한다.
          const statementIndex = imports.byLine.get(lineNumber)
          if (statementIndex !== undefined) {
            const statement = imports.statements[statementIndex]
            if (counterpartKeys.has(statement.key)) continue

            const importReason = allowed.find(([pattern]) => pattern.test(statement.text))
            if (importReason) {
              usedReasons.add(`${relativePath}::${importReason[1]}`)
              continue
            }
            if (reportedStatements.has(statementIndex)) continue
            reportedStatements.add(statementIndex)
            unexplained.push(`${relativePath}:${lineNumber} ${sign}${statement.text}`)
            continue
          }

          const reason = allowed.find(([pattern]) => pattern.test(trimmed))
          if (reason) {
            usedReasons.add(`${relativePath}::${reason[1]}`)
            openDepth = Math.max(0, openDepth + openBracketDelta(trimmed))
            previousLineContinues = trimmed.endsWith("=")
            continue
          }
          if (continuesAllowedStatement) {
            openDepth = Math.max(0, openDepth + openBracketDelta(trimmed))
            continue
          }
          if (reindented.has(`${sign}${lineNumber}`)) continue

          unexplained.push(`${relativePath}:${lineNumber} ${sign}${text}`)
        }
      }
    }

    // 허용 목록이 실제 차이보다 넓어지지 않게, 적어 둔 이유가 모두 쓰였는지도 확인한다.
    for (const [, why] of allowed) {
      assert.ok(
        usedReasons.has(`${relativePath}::${why}`),
        `쓰이지 않는 허용 항목이 남아 있다: ${relativePath} — ${why}`,
      )
    }
  }

  assert.deepEqual(unexplained, [], `원격 대비 설명되지 않은 차이:\n${unexplained.join("\n")}`)
})

test("AC-01: 방코드 모달의 마크업 구조는 원격과 같다", () => {
  // 위 허용 목록에서 닫는 `</span>` 한 줄을 "fragment 때문에 hunk가 갈라진 것"으로 설명했다.
  // 그 설명이 맞으려면 span 자체가 늘거나 줄지 않아야 한다 — 여기서 그것을 확인한다.
  // (fragment `<>`와 오류 문구 `<p>`는 로컬 복사 계약이 더한 것이라 개수 비교에서 빼지 않는다.)
  const relativePath = "domains/game/matching/components/RoomCodeViewModal.jsx"
  const local = readSrc(relativePath)
  const remote = git([`show`, `${REMOTE_REF}:frontend/src/${relativePath}`])

  const count = (source, pattern) => (source.match(pattern) ?? []).length

  assert.equal(count(local, /<span\b/g), count(remote, /<span\b/g), "span 여는 태그 수가 달라졌다")
  assert.equal(count(local, /<\/span>/g), count(remote, /<\/span>/g), "span 닫는 태그 수가 달라졌다")
  assert.equal(count(local, /<button\b/g), count(remote, /<button\b/g), "button 수가 달라졌다")
})

test("AC-01: 이식한 파일의 상대 경로 import는 실제 파일을 가리킨다", () => {
  // 별칭을 상대 경로로 바꾸는 일은 "다르게 쓰기"가 아니라 "같은 파일을 가리키게 하기"다.
  // 가리키는 파일이 없으면 치환이 잘못된 것이므로, 위 key 비교와 별개로 여기서 확인한다.
  for (const relativePath of PORTED_FILES) {
    const { statements } = collectImports(readSrc(relativePath), relativePath)
    for (const statement of statements) {
      if (!statement.module.startsWith(".")) continue
      assert.ok(
        existsSync(path.join(srcRoot, statement.target.split("/").join(path.sep))),
        `${relativePath}: 가리키는 파일이 없다 — ${statement.module}`,
      )
    }
  }
})

// ── AC-03: 지정된 5개 테스트가 실행 대상에 들어 있는지 ────────────────────────

/** 성공 조건이 "수정 없이 통과한다"고 지정한 테스트들. */
const DESIGNATED_TESTS = [
  "domains/game/mode/hooks/__tests__/useRoomCodeInput.test.js",
  "domains/game/matching/utils/__tests__/roomCode.test.js",
  "domains/game/setup/utils/__tests__/roleComposition.test.js",
  "domains/game/setup/utils/__tests__/buildCreateRoomPayload.test.js",
  "domains/game/setup/hooks/__tests__/useRoleCompositionState.test.js",
]

// package.json이 정한 실행 대상 glob(src, **, __tests__, *.test.js)을 실제 파일 목록으로 펼친다.
function expandTestGlob(frontendRoot, pattern) {
  const segments = pattern.split("/")
  assert.deepEqual(
    segments,
    ["src", "**", "__tests__", "*.test.js"],
    `실행 대상 glob 모양이 바뀌었다: ${pattern}`,
  )

  const found = new Set()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (path.basename(dir) === "__tests__" && entry.name.endsWith(".test.js")) found.add(full)
    }
  }
  walk(path.join(frontendRoot, segments[0]))

  return found
}

test("AC-03: 지정된 5개 테스트가 npm test의 실행 대상에 들어 있다", () => {
  const frontendRoot = path.join(srcRoot, "..")
  const testScript = JSON.parse(readFileSync(path.join(frontendRoot, "package.json"), "utf8")).scripts
    .test
  // 실행 대상은 test 스크립트의 `--test` 뒤 glob이 전부다 — 그 glob을 여기서 그대로 펼친다.
  const globMatch = testScript.match(/--test\s+(\S+)\s*$/)
  assert.ok(globMatch, `test 스크립트에서 실행 대상 glob을 찾지 못했다: ${testScript}`)

  const runSet = expandTestGlob(frontendRoot, globMatch[1])

  // 이 테스트 자신이 그 집합 안에 있어야, 위 계산이 실제 실행 경로와 같다는 근거가 된다.
  assert.ok(runSet.has(fileURLToPath(import.meta.url)), "이 테스트 자신이 실행 대상에 없다")

  for (const relativePath of DESIGNATED_TESTS) {
    const absolute = path.join(srcRoot, relativePath)
    assert.ok(existsSync(absolute), `지정된 테스트가 없다: ${relativePath}`)
    assert.ok(runSet.has(absolute), `실행 대상에 포함되지 않는다: ${relativePath}`)
    assert.match(
      readSrc(relativePath),
      /\btest\(/,
      `테스트를 정의하지 않는다: ${relativePath}`,
    )
  }
})

test("AC-03: 지정된 5개 테스트는 이번 작업에서 수정하지 않았다", () => {
  // 기대값을 고쳐 통과시키지 않았다는 근거다. 슬라이스 시작 커밋과 비교한다.
  const base = "feed38e"
  try {
    git(["cat-file", "-e", `${base}^{commit}`])
  } catch (error) {
    assert.fail(`슬라이스 기준 커밋(${base})이 없어 미수정 근거를 만들 수 없다: ${error.message}`)
  }

  const changed = git([
    "diff",
    "--name-only",
    base,
    "--",
    ...DESIGNATED_TESTS.map((relativePath) => `frontend/src/${relativePath}`),
  ]).trim()

  assert.equal(changed, "", `지정된 테스트가 수정됐다:\n${changed}`)
})

// ── AC-02: 라우트 → 페이지 → 부모 → 자식 연결 ────────────────────────────────

test("AC-02: 라우터가 이식한 화면 3개(멀티플레이·방코드·게임 설정)를 그린다", () => {
  assertWires("app/routes/index.jsx", [
    [/import MultiplayEntryPage from "[^"]*MultiplayEntryPage"/, "MultiplayEntryPage를 import하지 않는다"],
    [/path: "\/multiplay", element: <MultiplayEntryPage \/>/, "/multiplay 라우트가 없다"],
    [/path: "\/roomInvite", element: <RoomInvitePage \/>/, "/roomInvite 라우트가 없다"],
    [/path: "\/game-setup", element: <GameSetupPage \/>/, "/game-setup 라우트가 없다"],
  ])
})

test("AC-02: 방 목록 화면이 페이지→영역→셸→패널→행으로 이어진다", () => {
  assertWires("domains/game/mode/pages/MultiplayEntryPage.jsx", [
    [/import MultiplayRoomListArea from "\.\.\/components\/MultiplayRoomListArea\.jsx"/, "목록 영역을 import하지 않는다"],
    [/<MultiplayRoomListArea[\s\S]*?rooms=\{rooms\}/, "rooms를 넘기지 않는다"],
    [/<MultiplayRoomListArea[\s\S]*?onEnterRoom=\{joinPublicRoom\}/, "입장 콜백을 넘기지 않는다"],
    [/<MultiplayRoomListArea[\s\S]*?onJoinByCode=\{\(roomId\)/, "코드 입장 콜백을 넘기지 않는다"],
    [/<MultiplayRoomListArea[\s\S]*?isJoining=\{isJoining\}/, "isJoining을 넘기지 않는다"],
  ])
  assertWires("domains/game/mode/components/MultiplayRoomListArea.jsx", [
    [/import RoomListShell from "[^"]*RoomListShell\.jsx"/, "셸을 import하지 않는다"],
    [/<RoomListShell[\s\S]*?onJoinByCode=\{onJoinByCode\}/, "코드 입장 콜백을 셸로 넘기지 않는다"],
  ])
  assertWires("domains/game/mode/components/roomList/RoomListShell.jsx", [
    [/import RoomListPanel from "\.\/RoomListPanel\.jsx"/, "패널을 import하지 않는다"],
    [/<RoomListPanel[\s\S]*?rooms=\{pageRooms\}/, "패널에 페이지 분량을 넘기지 않는다"],
    [/from "\.\.\/\.\.\/constants\/roomListLayout\.js"/, "레이아웃 상수를 상대 경로로 쓰지 않는다"],
  ])
  assertWires("domains/game/mode/components/roomList/RoomListPanel.jsx", [
    [/import RoomListRow from "[^"]*RoomListRow\.jsx"/, "행을 import하지 않는다"],
    [/<RoomListRow[\s\S]*?room=\{room\}[\s\S]*?selected=\{room\.id === selectedRoomId\}/, "행에 방·선택 상태를 넘기지 않는다"],
  ])
  assertWires("domains/game/mode/components/roomList/RoomListRow.jsx", [
    [/from "\.\.\/\.\.\/constants\/roomListLayout\.js"/, "레이아웃 상수를 상대 경로로 쓰지 않는다"],
  ])
})

test("AC-02: 방코드 화면이 페이지→프레임→입력칸으로 이어진다", () => {
  assertWires("domains/game/mode/pages/RoomInvitePage.jsx", [
    [/import RoomCodeFrame from "[^"]*RoomCodeFrame\.jsx"/, "프레임을 import하지 않는다"],
    [/<RoomCodeFrame[\s\S]*?value=\{roomCode\}[\s\S]*?onChange=\{setRoomCode\}/, "프레임에 코드 상태를 넘기지 않는다"],
  ])
  assertWires("domains/game/mode/components/RoomCodeFrame.jsx", [
    [/import RoomCodeInput from "[^"]*RoomCodeInput\.jsx"/, "입력칸을 import하지 않는다"],
    [/<RoomCodeInput[\s\S]*?value=\{value\}[\s\S]*?onChange=\{onChange\}/, "입력칸에 값·변경 콜백을 넘기지 않는다"],
  ])
  assertWires("domains/game/mode/components/RoomCodeInput.jsx", [
    [/from "\.\.\/hooks\/useRoomCodeInput\.js"/, "훅을 상대 경로로 쓰지 않는다"],
  ])
})

test("AC-02: 게임 설정 화면이 페이지→패널→일반 탭→역할 구성으로 이어진다", () => {
  assertWires("domains/game/setup/pages/GameSetupPage.jsx", [
    [/import GameSetupPanel from "\.\.\/components\/GameSetupPanel\.jsx"/, "설정 패널을 import하지 않는다"],
    [/<GameSetupPanel[\s\S]*?onCreateGame=\{createGame\}/, "생성 콜백을 패널에 넘기지 않는다"],
  ])
  assertWires("domains/game/setup/components/GameSetupPanel.jsx", [
    [/import GeneralGameSetupTab from "\.\/GeneralGameSetupTab\.jsx"/, "일반 탭을 import하지 않는다"],
    [/<GeneralGameSetupTab[\s\S]*?roleComposition=\{roleComposition\}/, "역할 구성 상태를 일반 탭에 넘기지 않는다"],
    [/<GameSetupCreateButton[\s\S]*?onClick=\{handleCreateClick\}/, "생성 버튼이 handleCreateClick에 연결돼 있지 않다"],
    // 이식한 스크롤 훅이 실제 본문 ref에 연결돼 있어야 모드 전환 시 스크롤이 맞는다.
    [
      /useSetupContentScrollOnRoleModeChange\(setupContentRef, roleComposition\.mode, activeTab\)/,
      "스크롤 훅을 호출하지 않는다",
    ],
    [/<div ref=\{setupContentRef\} className=\{SETUP_CONTENT_CLASS\}>/, "본문 div에 ref가 없다"],
  ])
  assertWires("domains/game/setup/components/GeneralGameSetupTab.jsx", [
    [/import RoleCompositionSection from "\.\/RoleCompositionSection\.jsx"/, "역할 구성 구역을 import하지 않는다"],
    [/<RoleCompositionSection[\s\S]*?mode=\{roleComposition\.mode\}/, "역할 구성 구역에 모드를 넘기지 않는다"],
  ])
  assertWires("domains/game/setup/components/RoleCompositionSection.jsx", [
    // 스크롤 훅이 클래스가 아니라 이 표식으로 대상을 찾는다.
    [/data-setup-role-composition\b/, "스크롤 훅이 찾는 표식이 없다"],
    [/data-setup-role-composition-summary/, "요약 표식이 없다"],
  ])
  assertWires("domains/game/setup/hooks/useSetupContentScrollOnRoleModeChange.js", [
    [/\[data-setup-role-composition\]/, "훅이 구역 표식을 찾지 않는다"],
    [/\[data-setup-role-composition-summary\]/, "훅이 요약 표식을 찾지 않는다"],
  ])
})

test("AC-02: 방코드 보기 모달이 매칭 화면에 연결돼 있다", () => {
  assertWires("domains/game/matching/pages/GameMatchingPage.jsx", [
    [/import MatchingRoomPanelArea from "\.\.\/components\/MatchingRoomPanelArea\.jsx"/, "패널 영역을 import하지 않는다"],
    [/<MatchingRoomPanelArea[\s\S]*?roomCode=\{roomCode\}/, "방 코드를 패널 영역에 넘기지 않는다"],
  ])
  assertWires("domains/game/matching/components/MatchingRoomPanelArea.jsx", [
    [/import RoomCodeViewModal from "\.\/RoomCodeViewModal\.jsx"/, "모달을 import하지 않는다"],
    [/<RoomCodeViewModal[\s\S]*?roomCode=\{roomCode\}/, "모달에 방 코드를 넘기지 않는다"],
  ])
})

// ── AC-04: 방 목록 행의 방 코드(입장 코드 필요) 표시 ──────────────────────────

test("코드 방 배지 스타일 상수가 실제로 존재한다", () => {
  assert.equal(typeof ROOM_LIST_ROW_LOCK_BADGE_CLASS, "string")
  assert.ok(ROOM_LIST_ROW_LOCK_BADGE_CLASS.length > 0, "배지 클래스가 비어 있다")
})

test("행은 방이 코드 값을 실어 주면 그 코드 값을 표시한다", () => {
  // 행이 실제로 그리는 값을 계산하는 함수를 그대로 부른다(재현이 아니라 같은 코드다).
  const shown = resolveRoomListRowCode({ accessType: "code", code: "AB2C3D" })

  assert.equal(shown.visible, true, "코드 방인데 배지를 그리지 않는다")
  assert.equal(shown.value, "AB2C3D", "코드 값이 표시값으로 나오지 않는다")
  assert.equal(shown.label, "AB2C3D", "배지가 코드 값을 그리지 않는다")
  assert.equal(shown.ariaText, "코드 AB2C3D", "스크린리더가 코드 값을 읽지 못한다")
})

test("코드 값 표시는 서버가 준 문자열을 가공하지 않는다", () => {
  // 서버 비교는 대소문자를 구분한다(matching/utils/roomCode.js 주석). 목록이 케이스를
  // 바꿔 보여주면 사용자가 그대로 옮겨 적었을 때 반드시 참가에 실패한다.
  assert.equal(resolveRoomListRowCode({ accessType: "code", code: "aB2c3D" }).value, "aB2c3D")
})

test("코드 값이 없거나 형식이 깨졌으면 값 대신 코드 필요만 표시한다", () => {
  for (const code of [undefined, null, "", "AB2", "AB2C3D7", "AB2-C3D", 123]) {
    const shown = resolveRoomListRowCode({ accessType: "code", code })
    assert.equal(shown.visible, true, `코드 방 배지가 사라졌다: ${String(code)}`)
    assert.equal(shown.value, "", `깨진 코드를 값으로 표시한다: ${String(code)}`)
    assert.equal(shown.label, "코드", `배지 문구가 다르다: ${String(code)}`)
    assert.equal(shown.ariaText, "코드 필요", `스크린리더 문구가 다르다: ${String(code)}`)
  }
})

test("코드가 필요 없는 방에는 코드 배지를 그리지 않는다", () => {
  const shown = resolveRoomListRowCode({ accessType: "open", code: "AB2C3D" })
  assert.equal(shown.visible, false, "공개 방에 코드 배지를 그린다")
  assert.equal(shown.label, "", "공개 방에 배지 문구가 있다")
  assert.equal(shown.ariaText, "", "공개 방에 코드 문구를 읽어준다")
})

test("행이 그 계산 결과를 배지와 aria-label에 그대로 연결한다", () => {
  assert.match(
    roomListRowSource,
    /const rowCode = resolveRoomListRowCode\(room\)/,
    "행이 코드 표시를 계산하지 않는다",
  )
  assert.match(
    roomListRowSource,
    /\{rowCode\.visible \? \(\s*\n\s*<span className=\{ROOM_LIST_ROW_LOCK_BADGE_CLASS\}>\{rowCode\.label\}<\/span>/,
    "배지가 계산된 코드 라벨을 그리지 않는다",
  )
  // 배지가 들어 있는 오버레이는 aria-hidden이라, 이 문구가 빠지면 스크린리더에서는
  // 코드 방인지도, 코드 값도 알 방법이 사라진다.
  assert.match(
    roomListRowSource,
    /rowCode\.ariaText \? `, \$\{rowCode\.ariaText\}` : ""/,
    "aria-label이 코드 문구를 싣지 않는다",
  )
})

test("행의 코드 표시는 서버가 목록에 실어 주지 않은 값을 만들어 내지 않는다", () => {
  // 표시 규칙이 값을 지어내지 않는다는 것과, 지금 공개 목록 payload에 코드 값이 없다는 것은
  // 서로 다른 사실이다. 앞은 위 테스트가, 뒤는 서버 목록 계약이 정한다 — 목록 계약이 바뀌어
  // 코드 값이 실려 오면 그때부터 행은 값을 그대로 보여준다.
  const listContract = readFileSync(
    path.join(srcRoot, "..", "..", "backend", "socket", "matchmaking.js"),
    "utf8",
  )
  const builder = listContract
    .split("function buildPublicRoomList()")[1]
    ?.split("\nfunction ")[0]
  assert.ok(builder, "공개 목록 payload를 만드는 함수를 찾지 못했다")
  assert.ok(!/^\s*code:/m.test(builder), "공개 목록 payload가 코드 값을 싣는다")
  // 더미 목록도 같은 계약을 따른다(코드 값 없이 accessType만).
  assert.ok(
    !/\bcode:/.test(readSrc("domains/game/mode/constants/multiplayRooms.js")),
    "더미 목록이 코드 값을 담는다",
  )
})

test("코드 방을 고르면 입장 버튼이 코드 입력 경로로 넘긴다", () => {
  // 행의 "코드" 표시가 실제 입장 흐름으로 이어지는 지점이다 — 코드 방을 고르면
  // 버튼이 잠기는 대신 코드 입력 화면으로 방 id를 들고 넘어간다.
  assertWires("domains/game/mode/components/roomList/RoomListShell.jsx", [
    [/const selectedRoomNeedsCode = selectedRoom\?\.accessType === "code"/, "코드 방 판정이 없다"],
    [/if \(selectedRoomNeedsCode\) onJoinByCode\?\.\(selectedRoom\.id\)/, "코드 방 입장이 코드 화면으로 가지 않는다"],
    [/\? "코드 입력"/, "코드 방 입장 버튼 라벨이 다르다"],
  ])
})

test("선택된 행은 별도 오버레이 대신 프레임 강조 클래스를 덧붙인다", () => {
  assert.ok(ROOM_LIST_ROW_FRAME_SELECTED_CLASS.length > 0)
  assert.ok(
    roomListRowSource.includes(
      "`${ROOM_LIST_ROW_FRAME_CLASS}${selected ? ` ${ROOM_LIST_ROW_FRAME_SELECTED_CLASS}` : \"\"}`",
    ),
    "선택 강조가 프레임 className에 연결돼 있지 않다",
  )
  assert.ok(ROOM_LIST_ROW_FRAME_CLASS.includes("transition-[filter]"), "강조 전환이 없다")
})

// ── AC-04: 코드 입력이 로컬 훅의 정규화 결과를 제출한다 ───────────────────────

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("HTMLInputElement", dom.window.HTMLInputElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window))
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { fireEvent, render } = await import("@testing-library/react")
const { ROOM_CODE_INPUT_ATTRIBUTES, useRoomCodeInput } = await import("../hooks/useRoomCodeInput.js")

/**
 * RoomInvitePage의 입력→제출 경로와 같은 모양의 하니스다. 페이지와 RoomCodeInput은 .jsx라
 * node --test에서 import할 수 없으므로, 두 파일이 하는 일(훅이 돌려준 char를 칸 value로 그리고,
 * 칸 이벤트를 훅 핸들러로 넘기고, 길이가 다 찼을 때만 제출한다)만 같은 순서로 재현한다.
 * 아래 "하니스와 실제 소스가 같은 연결을 쓴다" 테스트가 이 재현이 실제 파일과 어긋나면 깨진다.
 */
function JoinHarness({ submitted }) {
  const [roomCode, setRoomCode] = useState("")

  const hook = useRoomCodeInput({
    value: roomCode,
    onChange: setRoomCode,
    autoFocus: false,
    disabled: false,
    readOnly: false,
  })

  // useRoomInvitePage.joinRoom과 같은 길이 가드다(자릿수가 다 차기 전에는 보내지 않는다).
  const joinRoom = () => {
    if (roomCode.length < ROOM_CODE_LENGTH) return
    submitted.push({ roomCode })
  }

  return createElement("div", null, [
    ...hook.getChars().map((char, index) =>
      createElement("input", {
        key: `cell-${index}`,
        ref: (el) => {
          hook.inputRefs.current[index] = el
        },
        ...ROOM_CODE_INPUT_ATTRIBUTES,
        value: char,
        "data-testid": `cell-${index}`,
        onChange: (event) => hook.handleChange(index, event),
        onKeyDown: (event) => hook.handleKeyDown(index, event),
        onPaste: hook.handlePaste,
      }),
    ),
    createElement("button", { key: "join", type: "button", "data-testid": "join", onClick: joinRoom }, "참여하기"),
  ])
}

function setup() {
  const submitted = []
  const view = render(createElement(JoinHarness, { submitted }))
  const cells = Array.from({ length: ROOM_CODE_LENGTH }, (_, index) => view.getByTestId(`cell-${index}`))

  return {
    submitted,
    cells,
    displayed: () => cells.map((cell) => cell.value).join(""),
    submit: () => fireEvent.click(view.getByTestId("join")),
    unmount: view.unmount,
  }
}

function type(cell, char) {
  cell.focus()
  fireEvent.change(cell, { target: { value: `${cell.value}${char}` } })
}

test("하니스와 실제 소스가 같은 연결을 쓴다(RoomCodeInput·페이지 제출)", () => {
  // (1) 실제 입력칸은 훅이 돌려준 char를 그대로 value로 그린다 — 화면에 보이는 값의 출처가
  //     하니스와 같다는 뜻이다.
  assertWires("domains/game/mode/components/RoomCodeInput.jsx", [
    [/const \{ inputRefs, getChars, handleChange, handleKeyDown, handlePaste \} =\s*\n?\s*useRoomCodeInput\(/, "훅에서 같은 값을 받지 않는다"],
    [/const chars = getChars\(\)/, "표시할 char를 훅에서 얻지 않는다"],
    [/chars\.map\(\(char, index\) =>/, "칸을 char 배열로 그리지 않는다"],
    [/value=\{char\}/, "칸이 훅의 char를 표시하지 않는다"],
    [/\{\.\.\.ROOM_CODE_INPUT_ATTRIBUTES\}/, "칸 속성이 훅과 같은 출처가 아니다"],
    [/onChange=\{\(event\) => handleChange\(index, event\)\}/, "칸 변경이 훅으로 가지 않는다"],
    [/onKeyDown=\{\(event\) => handleKeyDown\(index, event\)\}/, "칸 키 입력이 훅으로 가지 않는다"],
    [/onPaste=\{handlePaste\}/, "붙여넣기가 훅으로 가지 않는다"],
    [/ref=\{\(el\) => \{ inputRefs\.current\[index\] = el \}\}/, "칸 ref가 훅으로 가지 않는다"],
  ])

  // (2) 실제 페이지는 훅 상태(roomCode)를 프레임에 주고, "참여하기"를 joinRoom에 건다.
  assertWires("domains/game/mode/pages/RoomInvitePage.jsx", [
    [/const \{ uiVisible, roomCode, setRoomCode, joinRoom, goBackToModeSelect \} = useRoomInvitePage\(\)/, "페이지가 훅 상태를 쓰지 않는다"],
    [/label="참여하기"[\s\S]*?onClick=\{joinRoom\}/, "참여하기 버튼이 joinRoom에 연결돼 있지 않다"],
  ])

  // (3) 실제 제출은 길이 가드 뒤 입력값을 그대로 소켓 payload의 roomCode로 싣는다.
  //     하니스의 가드(ROOM_CODE_LENGTH)와 같은 자릿수인지도 함께 고정한다.
  const invitePageHook = readSrc("domains/game/mode/hooks/useRoomInvitePage.js")
  const guard = invitePageHook.match(/if \(roomCode\.length < (\d+)\) return/)
  assert.ok(guard, "제출 길이 가드가 없다")
  assert.equal(Number(guard[1]), ROOM_CODE_LENGTH, "페이지 가드와 하니스 가드의 자릿수가 다르다")
  assert.match(
    invitePageHook,
    /emit\("join_room_by_code", \{\s*roomCode,/,
    "입력값이 그대로 제출 payload에 실리지 않는다",
  )
})

test("방코드 보기 모달은 정규화된 코드 값을 프레임에 표시한다", () => {
  assertWires("domains/game/matching/components/RoomCodeViewModal.jsx", [
    [/const displayRoomCode = normalizeRoomCode\(roomCode\)/, "표시값을 정규화하지 않는다"],
    [/<RoomCodeFrame[\s\S]*?value=\{displayRoomCode\}/, "정규화된 값을 프레임에 넘기지 않는다"],
    [/readOnly/, "읽기 전용이 아니다"],
  ])
})

test("소문자로 친 코드는 대문자로 정규화된 값이 제출된다", () => {
  const { cells, displayed, submit, submitted, unmount } = setup()

  const typed = "ab2c3d"
  for (let index = 0; index < typed.length; index += 1) type(cells[index], typed[index])

  submit()

  assert.equal(displayed(), "AB2C3D", "화면에 보이는 값이 정규화되지 않았다")
  assert.deepEqual(submitted, [{ roomCode: "AB2C3D" }], "제출값이 화면 값과 다르다")
  unmount()
})

test("구분자가 섞인 코드를 붙여넣어도 정규화된 값이 제출된다", () => {
  const { cells, displayed, submit, submitted, unmount } = setup()

  fireEvent.paste(cells[0], { clipboardData: { getData: () => " ab2-c3d " } })

  assert.equal(displayed(), "AB2C3D", "붙여넣은 값이 칸에 표시되지 않았다")
  submit()

  assert.deepEqual(submitted, [{ roomCode: "AB2C3D" }])
  unmount()
})

test("자릿수가 덜 찬 코드는 제출되지 않는다", () => {
  const { cells, submit, submitted, unmount } = setup()

  type(cells[0], "a")
  type(cells[1], "b")
  submit()

  assert.deepEqual(submitted, [], "미완성 코드를 보냈다")
  unmount()
})

test("쓸 수 없는 문자는 칸에도 제출값에도 남지 않는다", () => {
  const { cells, displayed, submit, submitted, unmount } = setup()

  // 문자 집합([A-Za-z0-9]) 밖의 값은 칸을 채우지 못하므로 코드가 완성되지 않는다.
  for (const char of ["가", "_", " ", "-", "!"]) type(cells[0], char)

  assert.equal(displayed(), "", "허용되지 않은 문자가 칸에 남았다")
  submit()
  assert.deepEqual(submitted, [], "완성되지 않은 코드를 보냈다")
  unmount()
})
