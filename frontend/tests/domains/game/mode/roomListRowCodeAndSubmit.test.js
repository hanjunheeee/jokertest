import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
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
    path.join(srcRoot, "..", "..", "backend", "socket", "matchmaking", "room", "view.js"),
    "utf8",
  )
  const builder = listContract
    .split("function buildPublicRoomList()")[1]
    ?.split("\nfunction ")[0]
  assert.ok(builder, "공개 목록 payload를 만드는 함수를 찾지 못했다")
  assert.ok(!/^\s*code:/m.test(builder), "공개 목록 payload가 코드 값을 싣는다")
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
    [/const \{ uiVisible, roomCode, setRoomCode, joinRoom, isJoining, goBackToModeSelect \} = useRoomInvitePage\(\)/, "페이지가 훅 상태를 쓰지 않는다"],
    [/label="참여하기"[\s\S]*?onClick=\{joinRoom\}/, "참여하기 버튼이 joinRoom에 연결돼 있지 않다"],
  ])

  // 입장 요청 보내기는 useRoomCodeJoin.js로 나뉨 (코드 분리, 두 파일 같이 읽음)
  const invitePageSrc = readSrc("domains/game/mode/hooks/useRoomInvitePage.js")
  const codeJoinSrc = readSrc("domains/game/mode/hooks/useRoomCodeJoin.js")
  const guard = invitePageSrc.match(/if \(roomCode\.length < (\d+)\) return/)
  assert.ok(guard, "제출 길이 가드가 없다")
  assert.equal(Number(guard[1]), ROOM_CODE_LENGTH, "페이지 가드와 하니스 가드의 자릿수가 다르다")
  // 입장 요청 모양은 useRoomInvitePage가 만들어 startJoin에 넘기고, 보내기는 useRoomCodeJoin이 함 (파일마다 따로 확인, 두 파일을 이어 붙이지 않음)
  assert.match(
    invitePageSrc,
    /const payload = \{\s*roomCode,[\s\S]*?startJoin\(payload\)/,
    "입력값이 그대로 제출 payload에 실리지 않는다",
  )
  assert.match(codeJoinSrc, /attemptRef\.current = \{ payload, moved: false \}[\s\S]*?sendJoin\(current, payload\)/, "담아 둔 payload를 그대로 sendJoin에 넘기지 않는다")
  assert.match(codeJoinSrc, /joinByCode\(socket, payload\)/, "담아 둔 payload를 그대로 보내지 않는다")
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
