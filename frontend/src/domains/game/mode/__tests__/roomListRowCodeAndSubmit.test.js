/**
 * AC-04: 방 목록 행의 "코드 필요" 표시와, 방코드 입력이 로컬 훅의 정규화 결과를 그대로
 * 제출하는지를 고정한다.
 *
 * RoomListRow는 .jsx라 JSX를 변환하지 않는 node --test로는 import할 수 없다. 그래서 행 쪽은
 * (1) 행이 실제로 쓰는 레이아웃 상수를 진짜로 import해 존재를 확인하고,
 * (2) 행 소스에서 표시 조건과 aria-label 문구가 그 상수에 연결돼 있는지를 확인한다.
 * 화면상의 최종 모습은 production build와 브라우저 확인이 담당한다(계획 메모의 검증 방식).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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
const roomListRowSource = readFileSync(
  path.join(here, "..", "components", "roomList", "RoomListRow.jsx"),
  "utf8",
)

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
 * RoomInvitePage의 입력→제출 경로와 같은 모양의 하니스다. 페이지 자체는 @/ 별칭과
 * react-router·소켓에 묶여 있어 node --test에서 import할 수 없으므로, 페이지가 하는 일
 * (훅이 돌려준 값을 그대로 state에 담았다가 제출한다)만 같은 순서로 재현한다.
 * 확인하려는 계약은 "제출되는 값 = 훅이 마지막으로 넘긴 정규화된 값"이다.
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
  const { cells, submit, submitted, unmount } = setup()

  fireEvent.paste(cells[0], { clipboardData: { getData: () => " ab2-c3d " } })
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
