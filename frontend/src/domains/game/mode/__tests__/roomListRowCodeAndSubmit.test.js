/**
 * UI-08 이식분 고정 테스트.
 *
 * - AC-01: 이식 대상 9개 파일이 모두 존재하고, 경로 별칭(@/) import가 남아 있지 않다.
 * - AC-02: 이식한 컴포넌트가 라우트 → 페이지 → 부모 → 자식으로 실제 화면 트리에 이어져 있다.
 * - AC-04: 방 목록 행이 "코드 필요"를 표시하고, 방코드 입력이 로컬 훅의 정규화 결과를 제출한다.
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
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createElement, useState } from "react"
import { JSDOM } from "jsdom"

import {
  ROOM_LIST_ROW_FRAME_CLASS,
  ROOM_LIST_ROW_FRAME_SELECTED_CLASS,
  ROOM_LIST_ROW_LOCK_BADGE_CLASS,
} from "../constants/roomListLayout.js"
import { ROOM_CODE_LENGTH } from "../../matching/utils/roomCode.js"

const here = path.dirname(fileURLToPath(import.meta.url))
// frontend/src (이 파일: src/domains/game/mode/__tests__/)
const srcRoot = path.resolve(here, "..", "..", "..", "..")

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

test("행은 accessType이 code인 방에만 코드 배지를 그린다", () => {
  assert.match(
    roomListRowSource,
    /const isCode = accessType === "code"/,
    "코드 방 판정이 accessType에서 나오지 않는다",
  )
  assert.match(
    roomListRowSource,
    /\{isCode \? <span className=\{ROOM_LIST_ROW_LOCK_BADGE_CLASS\}>코드<\/span> : null\}/,
    "코드 배지가 isCode에 연결돼 있지 않다",
  )
})

test("코드 방은 화면 배지뿐 아니라 aria-label로도 코드 필요를 읽어준다", () => {
  // 배지가 들어 있는 오버레이는 aria-hidden이라, 이 문구가 빠지면 스크린리더에서는
  // 코드 방인지 알 방법이 사라진다.
  assert.match(roomListRowSource, /isCode \? ", 코드 필요" : ""/)
})

test("행은 방의 비밀 코드 값 자체를 그리지 않는다", () => {
  // 공개 목록 payload에는 코드 값이 담기지 않는다(constants/multiplayRooms.js 주석).
  // 표시 대상은 "코드가 필요한 방"이라는 사실뿐이며, 코드 값 노출은 새 비밀 노출이 된다.
  assert.ok(!/room\.code\b/.test(roomListRowSource), "행이 방 코드 값을 참조한다")
  assert.ok(
    !/\bcode,/.test(roomListRowSource.split("const {")[1]?.split("} = room")[0] ?? ""),
    "행이 room에서 code를 구조분해한다",
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
