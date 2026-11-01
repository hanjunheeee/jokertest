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
} from "../../../../src/domains/game/mode/constants/roomListLayout.js"
import { resolveRoomListRowCode } from "../../../../src/domains/game/mode/utils/resolveRoomListRowCode.js"
import { ROOM_CODE_LENGTH } from "../../../../src/domains/game/matching/utils/roomCode.js"

const here = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(here, "..", "..", "..", "..", "src")
const repoRoot = path.resolve(srcRoot, "..", "..")

function readSrc(relativePath) {
  return readFileSync(path.join(srcRoot, relativePath), "utf8")
}

function assertWires(relativePath, patterns) {
  const source = readSrc(relativePath)
  for (const [pattern, why] of patterns) {
    assert.match(source, pattern, `${relativePath}: ${why}`)
  }
}

const roomListRowSource = readSrc("domains/game/mode/components/roomList/RoomListRow.jsx")

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
  for (const relativePath of PORTED_FILES) {
    const source = readSrc(relativePath)
    assert.ok(
      !/\bfrom\s+["']@\//.test(source) && !/\bimport\s+["']@\//.test(source),
      `@/ 별칭 import가 남아 있다: ${relativePath}`,
    )
  }
})

const REMOTE_REF = "origin/feature/ui-Phase1complete"

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
}

function assertRemoteRefExists() {
  let resolved = ""
  try {
    resolved = git(["rev-parse", "--verify", `${REMOTE_REF}^{commit}`]).trim()
  } catch (error) {
    assert.fail(`원격 비교 대상(${REMOTE_REF})을 찾지 못해 차이를 확인할 수 없다: ${error.message}`)
  }
  assert.match(resolved, /^[0-9a-f]{40}$/, `${REMOTE_REF}가 커밋을 가리키지 않는다`)
}

function resolveModuleTarget(module, fileRelativeToSrc) {
  const posixFile = fileRelativeToSrc.split(path.sep).join("/")
  if (module.startsWith("@/")) return module.slice(2)
  if (module.startsWith(".")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(posixFile), module))
  }
  return module
}

const withoutExtension = (target) => target.replace(/\.jsx?$/, "")

function makeImportStatement(text, fileRelativeToSrc) {
  const module = text.match(/["']([^"']+)["']\s*$/)?.[1] ?? ""
  const clause = text
    .replace(/^import\s*/, "")
    .replace(/\s*from\s*["'][^"']+["']\s*$/, "")
    .replace(/^["'][^"']+["']$/, "")
    .trim()
  const target = resolveModuleTarget(module, fileRelativeToSrc)

  return { text, module, clause, target, key: `${clause}|${withoutExtension(target)}` }
}

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

    const ends = /\bfrom\s+["'][^"']+["']/.test(line) || /^import\s+["'][^"']+["']/.test(line)
    if (!ends) return

    const text = pending.lines
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/,\s*\}/g, " }")
      .trim()
    const statementIndex = statements.length
    for (const number of pending.numbers) byLine.set(number, statementIndex)
    statements.push(makeImportStatement(text, fileRelativeToSrc))
    pending = null
  })

  return { byLine, statements }
}

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
    if (!hunk) continue
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

const F15_FONT_SIZE_UTILITY = /text-\[(clamp\([^\]]*\)|[0-9.]+(?:rem|px|em))\]/g

function toF15ScaledTypography(text) {
  return text.replace(F15_FONT_SIZE_UTILITY, "app-text-scaled [--app-text-size:$1]")
}

function markF15ScaledTypographyLines(hunk) {
  const scaled = new Set()
  const removedByScaledText = new Map()

  for (const entry of hunk.removed) {
    const converted = toF15ScaledTypography(entry.text)
    if (converted === entry.text) continue
    if (!removedByScaledText.has(converted)) removedByScaledText.set(converted, [])
    removedByScaledText.get(converted).push(entry)
  }

  for (const entry of hunk.added) {
    const candidates = removedByScaledText.get(entry.text)
    if (!candidates?.length) continue

    const [removed] = candidates.splice(0, 1)
    scaled.add(`+${entry.lineNumber}`)
    scaled.add(`-${removed.lineNumber}`)
  }

  return scaled
}

const ALLOWED_LOCAL_CONTRACT_DIFFS = {
  "domains/game/mode/components/roomList/RoomListRow.jsx": [
    [/^const \{ stage, current, max, title/, "AC-04: 코드 표시를 room 객체 전체로 계산한다"],
    [
      /rowCode|resolveRoomListRowCode|isCode|accessType/,
      "AC-04: 코드 방 배지가 고정 문구 대신 방 코드 값을 표시한다",
    ],
    [
      /settingsSummary|summarizeRoomListSettings|ROOM_LIST_ROW_SETTINGS_CLASS/,
      "F-20 AC-03: 서버가 승인한 직업 구성·제한시간 요약을 목록 행과 aria-label에 표시한다" +
        " — 요약 문자열은 utils/summarizeRoomListSettings.js가 만들고 이 행은 표시만 한다",
    ],
    [
      /^statusLabel \? `, \$\{statusLabel\}` : ""$|^\}`\}$|^\}\$\{statusLabel \? `, \$\{statusLabel\}` : ""\}`\}$/,
      "같은 계약: aria-label에 설정 요약을 끼워 넣으며 기존 마감/진행중 표시가 여러 줄로 나뉘었다" +
        " — 읽어주는 내용의 순서와 값은 그대로다",
    ],
    [
      /^import \{ ROOM_LIST_ROW_BOTTOM_ROW_CLASS[\s\S]*roomListLayout\.js"$/,
      "같은 계약: 요약 표시용 스타일 상수(ROOM_LIST_ROW_SETTINGS_CLASS)가 같은 import 문장에 더해져" +
        " 원격과 가져오는 이름 집합이 달라졌다(출처 파일은 그대로다)",
    ],
    [
      /ROOM_LIST_ROW_HEADER_ROW_CLASS|ROOM_LIST_ROW_HEADER_DIVIDER_CLASS|settingsLine|showStatusBadges/,
      "목록 행 2줄 레이아웃: 윗줄 방장 이름(의 방), 아랫줄 설정 요약·인원 — 단계 배지는 aria-label만 유지",
    ],
    [
      /ROOM_LIST_ROW_TITLE_CLASS\}\>\{title\}/,
      "같은 레이아웃: 방 이름을 윗줄 헤더로 옮겼다",
    ],
    [
      /ROOM_LIST_ROW_STAGE_BADGE_CLASS|ROOM_LIST_ROW_TOP_ROW_CLASS/,
      "같은 레이아웃: 단계 배지·구 TOP_ROW import를 헤더 2줄 구조로 대체했다",
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
      /^import \{ (useEffect, )?(useId, )?useRef, useState \} from "react"$/,
      "로컬 복사 계약: 복사 오류 문구와 복사 버튼을 잇는 id를 useId로 만든다",
    ],
    [
      /copyGenerationRef|invalidateCopyFeedback|^useEffect\(\(\) => \{$|^return \(\) => \{$|^const generation = |^\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps$/,
      "F-24 AC-01: 복사 완료는 비동기다 — 닫힘·코드 교체·언마운트마다 세대를 올려, 늦게 도착한" +
        " 옛 완료가 지금 화면의 '복사됨'과 타이머를 건드리지 못하게 한다",
    ],
    [
      /useSyncExternalStore|useAuthStore|subscribeSocket|authUuid|identityGeneration|socketId/,
      "F-24 AC-01: 무효화 경계는 코드 문자열만이 아니다 — 같은 코드를 표시하는 동안에도 계정이" +
        " 갈아끼워지거나(A→B→A 포함) 연결이 교체되면 보류 중인 복사 결과를 버린다",
    ],
    [
      /isValidRoomCode|canCopy|ROOM_CODE_COPY_RESULTS|resolveRoomCodeCopyStatus|[cC]opyStatus|COPY_BTN_(DISABLED_)?CLASS/,
      "F-24 AC-01: 확인할 수 없는 코드에는 복사 진입 자체를 열지 않고, 도달한 상태를 흔들리지" +
        " 않는 코드로 노출한다",
    ],
    [
      /^const handleClose = \(\) => \{$|^\}$|^\},$|^\)$/,
      "같은 두 계약: 세대 무효화를 effect·공통 핸들러로 묶으며 블록 경계 줄이 옮겨졌다",
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
  "domains/game/setup/components/GameSetupPanel.jsx": [
    [
      /roomSettingsForm\.js"$/,
      "F-20 AC-03/AC-06: 편집 모드가 쓰는 계약(비편집 항목 목록·직업별 시간 지정 병합)을 공용 변환기에서 가져온다",
    ],
    [
      /^export default function GameSetupPanel\(\{$|^(visible|isCreating|onCreateGame|mode = "create"|initialFormState = null|formResetKey = null|submitLabel|submitBusyLabel|submitDisabled = false),$|^\}\) \{$|^export default function GameSetupPanel\(\{ visible, isCreating, onCreateGame \}\) \{$/,
      "F-20 AC-01/AC-03: 한 패널을 생성·편집 두 모드로 쓰기 위해 props가 늘어 여러 줄 서명이 됐다",
    ],
    [
      /isEditMode|hiddenItemIds|submitLabel|submitBusyLabel|submitDisabled/,
      "F-20 A-06: 편집 모드는 D-12 추가 규칙 세 항목을 그리지 않고, 제출 버튼 라벨·진행 표시가 모드별로 다르다",
    ],
    [
      /useSetupTabState\(ALL_SETUP_ITEMS|^(initialState: initialFormState|resetKey: formResetKey|initialComposition: initialFormState\?\.roleComposition \?\? null),$|^\}\)$/,
      "F-20 AC-03/AC-05: 폼이 서버 확정 설정에서 시작하고, 방·설정 버전이 교체되면 이전 초안을 버린다",
    ],
    [
      /editedRoleTimeIds|appliedResetKey|NIGHT_TIME_ID_TO_ROLE|handleSetRange|setRange=\{(handleSetRange|setRange)\}|^setRange\(id, next\)$/,
      "F-20 AC-03: 이번 편집에서 실제로 값이 바뀐 직업별 밤 시간을 추적해 저장 요청에 싣는다",
    ],
    [
      /handleSubmitClick|handleCreateClick/,
      "F-20 AC-03: 같은 버튼이 생성·저장 두 제출을 담당해 핸들러 이름이 모드 중립으로 바뀌었다",
    ],
    [
      /composition|specifiedRoleNightActionTimes|^onCreateGame\(\{$|^(checks|ranges),$/,
      "F-20 AC-03: 편집 제출은 요청 조립 없이 폼 상태를 그대로 넘기고, 생성 제출은 기존 변환기를 그대로 쓴다",
    ],
    [
      /^<MeetingGameSetupTab( checks=\{checks\} ranges=\{ranges\} setCheck=\{setCheck\} setRange=\{setRange\} \/>)?$|^(checks=\{checks\}|ranges=\{ranges\}|setCheck=\{setCheck\}|hiddenItemIds=\{hiddenItemIds\}|\/>)$/,
      "같은 계약: 회의&투표 탭에도 숨김 항목을 넘기느라 한 줄 JSX가 여러 줄로 늘어났다(넘기는 값은 그대로)",
    ],
    [
      /^(label=\{submitLabel|busyLabel=\{submitBusyLabel|busy=\{isCreating\}|disabled=\{isCreating \|\| submitDisabled)/,
      "같은 계약: 제출 버튼의 라벨·진행 표시·비활성 조건이 모드별 값을 받는다",
    ],
  ],
  "domains/game/setup/components/RoleCompositionSection.jsx": [],
  "domains/game/mode/constants/roomListLayout.js": [
    [
      /^export const ROOM_LIST_ROW_SETTINGS_CLASS =$|^"pointer-events-none min-w-0 shrink truncate font-subheading/,
      "F-20 AC-03: 목록 행에 추가된 설정 요약 표시의 스타일 상수다" +
        " — 기존 행 스타일 상수는 그대로 두고 새 상수만 덧붙였다",
    ],
    [
      /ROOM_LIST_ROW_HEADER_ROW_CLASS|ROOM_LIST_ROW_HEADER_DIVIDER_CLASS|justify-end|leading-tight/,
      "목록 행 2줄 레이아웃: 헤더·구분선 상수와 오버레이·제목·설정 스타일 조정",
    ],
    [
      /ROOM_LIST_ROW_TOP_ROW_CLASS|justify-between gap-\[clamp\(0\.05rem|ROOM_LIST_ROW_BOTTOM_ROW_CLASS|leading-none text-\[#f3d28d\]|pb-\[(1\.5|2\.5|3\.5|1|2|4|9)%\]/,
      "같은 레이아웃: TOP_ROW·justify-between 오버레이·BOTTOM_ROW·제목 스타일·하단 여백 조정",
    ],
  ],
  "domains/game/setup/hooks/useSetupContentScrollOnRoleModeChange.js": [],
}

function openBracketDelta(text) {
  const opened = (text.match(/[({]/g) ?? []).length
  const closed = (text.match(/[)}]/g) ?? []).length
  return opened - closed
}

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
      let previousLineContinues = false
      let openDepth = 0
      const reportedStatements = new Set()

      for (const hunk of hunks) {
        const reindented = markReindentedLines(hunk)
        const f15Scaled = markF15ScaledTypographyLines(hunk)

        for (const { lineNumber, text } of pick(hunk)) {
          const trimmed = text.trim()
          const continuesAllowedStatement = previousLineContinues || openDepth > 0
          previousLineContinues = false

          if (isComment(text)) continue

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
          if (f15Scaled.has(`${sign}${lineNumber}`)) continue

          unexplained.push(`${relativePath}:${lineNumber} ${sign}${text}`)
        }
      }
    }

    for (const [, why] of allowed) {
      assert.ok(
        usedReasons.has(`${relativePath}::${why}`),
        `쓰이지 않는 허용 항목이 남아 있다: ${relativePath} — ${why}`,
      )
    }
  }

  assert.deepEqual(unexplained, [], `원격 대비 설명되지 않은 차이:\n${unexplained.join("\n")}`)
})

test("AC-01: F-15 배율 전환 면제는 '값 보존 + 그 밖은 그대로'일 때만 성립한다", () => {
  const base = '  "font-subheading text-[clamp(1.02rem,1.38vw,1.16rem)] font-bold text-[#2a1810]"'
  const converted =
    '  "font-subheading app-text-scaled [--app-text-size:clamp(1.02rem,1.38vw,1.16rem)] font-bold text-[#2a1810]"'

  const mark = (removed, added) =>
    markF15ScaledTypographyLines({
      removed: removed.map((text, index) => ({ lineNumber: 10 + index, text })),
      added: added.map((text, index) => ({ lineNumber: 20 + index, text })),
    })

  assert.deepEqual([...mark([base], [converted])].sort(), ["+20", "-10"])

  const shrunk = converted.replace("clamp(1.02rem,1.38vw,1.16rem)", "clamp(0.9rem,1.38vw,1.16rem)")
  assert.deepEqual([...mark([base], [shrunk])], [])

  assert.deepEqual([...mark([base], [converted.replace("font-bold", "font-black")])], [])
  assert.deepEqual([...mark([base], [converted.replace("text-[#2a1810]", "text-[#8c1c13]")])], [])

  const colorOnly = '  "font-subheading text-[#2a1810]"'
  assert.deepEqual([...mark([colorOnly], ['  "font-subheading app-text-scaled text-[#2a1810]"'])], [])

  const other = base.replace("1.02rem", "1.2rem")
  const marked = mark([base, other], [converted])
  assert.deepEqual([...marked].sort(), ["+20", "-10"])
})

test("AC-01: 방코드 모달의 마크업 구조는 원격과 같다", () => {
  const relativePath = "domains/game/matching/components/RoomCodeViewModal.jsx"
  const local = readSrc(relativePath)
  const remote = git([`show`, `${REMOTE_REF}:frontend/src/${relativePath}`])

  const count = (source, pattern) => (source.match(pattern) ?? []).length

  assert.equal(count(local, /<span\b/g), count(remote, /<span\b/g), "span 여는 태그 수가 달라졌다")
  assert.equal(count(local, /<\/span>/g), count(remote, /<\/span>/g), "span 닫는 태그 수가 달라졌다")
  assert.equal(count(local, /<button\b/g), count(remote, /<button\b/g), "button 수가 달라졌다")
})

test("AC-01: 이식한 파일의 상대 경로 import는 실제 파일을 가리킨다", () => {
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

const DESIGNATED_TESTS = [
  "domains/game/mode/hooks/__tests__/useRoomCodeInput.test.js",
  "domains/game/matching/utils/__tests__/roomCode.test.js",
  "domains/game/setup/utils/__tests__/roleComposition.test.js",
  "domains/game/setup/utils/__tests__/buildCreateRoomPayload.test.js",
  "domains/game/setup/hooks/__tests__/useRoleCompositionState.test.js",
]

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
  const globMatch = testScript.match(/--test\s+(\S+)\s*$/)
  assert.ok(globMatch, `test 스크립트에서 실행 대상 glob을 찾지 못했다: ${testScript}`)

  const runSet = expandTestGlob(frontendRoot, globMatch[1])

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
    [/<GameSetupCreateButton[\s\S]*?onClick=\{handleSubmitClick\}/, "제출 버튼이 handleSubmitClick에 연결돼 있지 않다"],
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

test("코드 방 배지 스타일 상수가 실제로 존재한다", () => {
  assert.equal(typeof ROOM_LIST_ROW_LOCK_BADGE_CLASS, "string")
  assert.ok(ROOM_LIST_ROW_LOCK_BADGE_CLASS.length > 0, "배지 클래스가 비어 있다")
})

test("행은 방이 코드 값을 실어 주면 그 코드 값을 표시한다", () => {
  const shown = resolveRoomListRowCode({ accessType: "code", code: "AB2C3D" })

  assert.equal(shown.visible, true, "코드 방인데 배지를 그리지 않는다")
  assert.equal(shown.value, "AB2C3D", "코드 값이 표시값으로 나오지 않는다")
  assert.equal(shown.label, "AB2C3D", "배지가 코드 값을 그리지 않는다")
  assert.equal(shown.ariaText, "코드 AB2C3D", "스크린리더가 코드 값을 읽지 못한다")
})

test("코드 값 표시는 서버가 준 문자열을 가공하지 않는다", () => {
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
  assert.match(
    roomListRowSource,
    /rowCode\.ariaText \? `, \$\{rowCode\.ariaText\}` : ""/,
    "aria-label이 코드 문구를 싣지 않는다",
  )
})

test("행의 코드 표시는 서버가 목록에 실어 주지 않은 값을 만들어 내지 않는다", () => {
  const listContract = readFileSync(
    path.join(srcRoot, "..", "..", "backend", "socket", "matchmaking.js"),
    "utf8",
  )
  const builder = listContract
    .split("function buildPublicRoomList()")[1]
    ?.split("\nfunction ")[0]
  assert.ok(builder, "공개 목록 payload를 만드는 함수를 찾지 못했다")
  assert.ok(!/^\s*code:/m.test(builder), "공개 목록 payload가 코드 값을 싣는다")
  assert.ok(
    !/\bcode:/.test(readSrc("domains/game/mode/constants/multiplayRooms.js")),
    "더미 목록이 코드 값을 담는다",
  )
})

test("코드 방을 고르면 입장 버튼이 코드 입력 경로로 넘긴다", () => {
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
const { ROOM_CODE_INPUT_ATTRIBUTES, useRoomCodeInput } = await import("../../../../src/domains/game/mode/hooks/useRoomCodeInput.js")

function JoinHarness({ submitted }) {
  const [roomCode, setRoomCode] = useState("")

  const hook = useRoomCodeInput({
    value: roomCode,
    onChange: setRoomCode,
    autoFocus: false,
    disabled: false,
    readOnly: false,
  })

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

  assertWires("domains/game/mode/pages/RoomInvitePage.jsx", [
    [/const \{ uiVisible, roomCode, setRoomCode, joinRoom, goBackToModeSelect \} = useRoomInvitePage\(\)/, "페이지가 훅 상태를 쓰지 않는다"],
    [/label="참여하기"[\s\S]*?onClick=\{joinRoom\}/, "참여하기 버튼이 joinRoom에 연결돼 있지 않다"],
  ])

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

  for (const char of ["가", "_", " ", "-", "!"]) type(cells[0], char)

  assert.equal(displayed(), "", "허용되지 않은 문자가 칸에 남았다")
  submit()
  assert.deepEqual(submitted, [], "완성되지 않은 코드를 보냈다")
  unmount()
})
