import test from "node:test"
import assert from "node:assert/strict"
import { act, createElement, useState } from "react"
import { JSDOM } from "jsdom"

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
const { ROOM_CODE_INPUT_ATTRIBUTES, useRoomCodeInput } = await import("../../../../../src/domains/game/mode/hooks/useRoomCodeInput.js")

const CODE_LENGTH = 6

function Harness({ initialValue, autoFocus, disabled, readOnly, changes }) {
  const [value, setValue] = useState(initialValue)

  const handleChange = (next) => {
    changes.push(next)
    setValue(next)
  }

  const hook = useRoomCodeInput({ value, onChange: handleChange, autoFocus, disabled, readOnly })

  return createElement(
    "div",
    null,
    hook.getChars().map((char, index) =>
      createElement("input", {
        key: index,
        ref: (el) => {
          hook.inputRefs.current[index] = el
        },
        ...ROOM_CODE_INPUT_ATTRIBUTES,
        value: char,
        disabled,
        readOnly,
        "data-testid": `cell-${index}`,
        onChange: (event) => hook.handleChange(index, event),
        onKeyDown: (event) => hook.handleKeyDown(index, event),
        onPaste: hook.handlePaste,
      }),
    ),
  )
}

function setup({ initialValue = "", autoFocus = false, disabled = false, readOnly = false } = {}) {
  const changes = []
  const view = render(
    createElement(Harness, { initialValue, autoFocus, disabled, readOnly, changes }),
  )

  const cells = Array.from({ length: CODE_LENGTH }, (_, index) =>
    view.getByTestId(`cell-${index}`),
  )

  return {
    changes,
    cells,
    displayed: () => cells.map((cell) => cell.value).join(""),
    focusedIndex: () => cells.indexOf(dom.window.document.activeElement),
    unmount: view.unmount,
  }
}

function type(cell, char) {
  cell.focus()
  fireEvent.change(cell, { target: { value: `${cell.value}${char}` } })
}

const sleep = (ms) => new Promise((resolve) => { dom.window.setTimeout(resolve, ms) })

test("숫자를 한 글자씩 치면 순서대로 채워지고 다음 칸으로 넘어간다", () => {
  const { cells, changes, displayed, focusedIndex, unmount } = setup()

  type(cells[0], "1")
  assert.equal(displayed(), "1")
  assert.equal(focusedIndex(), 1, "다음 칸으로 자동 이동해야 한다")

  type(cells[1], "2")
  assert.equal(displayed(), "12")
  assert.equal(focusedIndex(), 2)

  assert.deepEqual(changes, ["1", "12"])
  unmount()
})

test("마지막 칸을 채워도 포커스가 범위를 벗어나지 않는다", () => {
  const { cells, displayed, focusedIndex, unmount } = setup({ initialValue: "12345" })

  type(cells[5], "6")

  assert.equal(displayed(), "123456")
  assert.equal(focusedIndex(), 5, "마지막 칸에 머물러야 한다")
  unmount()
})

test("영문자를 치면 그대로 입력된다", () => {
  const { cells, displayed, unmount } = setup()

  type(cells[0], "A")
  type(cells[1], "B")

  assert.equal(displayed(), "AB")
  unmount()
})

test("서버 문자 집합의 방코드를 끝까지 칠 수 있고 값이 가공되지 않는다", () => {
  const code = "AB2C3D"
  const { cells, changes, displayed, unmount } = setup()

  for (let index = 0; index < code.length; index += 1) {
    type(cells[index], code[index])
  }

  assert.equal(displayed(), code)
  assert.equal(changes.at(-1), code)
  unmount()
})

test("소문자를 치면 그 자리에서 대문자로 바뀌어 보인다", () => {
  const { cells, changes, displayed, unmount } = setup()

  type(cells[0], "a")
  type(cells[1], "b")

  assert.equal(displayed(), "AB")
  assert.equal(changes.at(-1), "AB", "서버로 나가는 값도 대문자여야 한다")
  unmount()
})

test("소문자로 친 방코드를 끝까지 채우면 전부 대문자가 된다", () => {
  const { cells, changes, displayed, unmount } = setup()

  const typed = "ab2c3d"
  for (let index = 0; index < typed.length; index += 1) {
    type(cells[index], typed[index])
  }

  assert.equal(displayed(), "AB2C3D")
  assert.equal(changes.at(-1), "AB2C3D")
  unmount()
})

test("쓸 수 없는 문자는 칸을 건드리지 않는다", () => {
  const { cells, changes, displayed, unmount } = setup()

  for (const char of [" ", "-", "가", "３", "!", "_"]) {
    type(cells[0], char)
  }

  assert.equal(displayed(), "", "허용되지 않은 문자가 칸에 남았다")
  assert.deepEqual(changes, [], "무시된 입력은 부모에게 전달하지 않는다")
  unmount()
})

test("영문자가 섞인 방코드를 붙여넣으면 전부 채워진다", () => {
  const { cells, changes, displayed, focusedIndex, unmount } = setup()

  fireEvent.paste(cells[0], { clipboardData: { getData: () => "AB2C3D" } })

  assert.equal(displayed(), "AB2C3D")
  assert.equal(changes.at(-1), "AB2C3D", "붙여넣은 값이 변형 없이 전달돼야 한다")
  assert.equal(focusedIndex(), 5, "마지막으로 채운 칸에 포커스가 간다")
  unmount()
})

test("구분자가 섞인 코드를 붙여넣어도 영숫자만 남아 채워진다", () => {
  const { cells, displayed, unmount } = setup()

  fireEvent.paste(cells[0], { clipboardData: { getData: () => " AB2-C3D " } })

  assert.equal(displayed(), "AB2C3D")
  unmount()
})

test("방코드보다 긴 값을 붙여넣으면 6자까지만 채워진다", () => {
  const { cells, displayed, unmount } = setup()

  fireEvent.paste(cells[0], { clipboardData: { getData: () => "AB2C3DZZZZ" } })

  assert.equal(displayed(), "AB2C3D")
  unmount()
})

test("소문자로 복사해 온 6자리 코드를 붙여넣으면 대문자로 채워진다", () => {
  const { cells, changes, displayed, focusedIndex, unmount } = setup()

  fireEvent.paste(cells[0], { clipboardData: { getData: () => "ab2c3d" } })

  assert.equal(displayed(), "AB2C3D")
  assert.equal(changes.at(-1), "AB2C3D")
  assert.equal(changes.at(-1).length, CODE_LENGTH, "6자리가 다 차야 참여하기가 동작한다")
  assert.equal(focusedIndex(), 5)
  unmount()
})

test("한 칸에 여러 글자가 한꺼번에 들어와도 전체 방코드로 처리된다", () => {
  const { cells, displayed, unmount } = setup()

  fireEvent.change(cells[0], { target: { value: "AB2C3D" } })

  assert.equal(displayed(), "AB2C3D")
  unmount()
})

test("Backspace는 글자가 있는 칸을 비운다", () => {
  const { cells, displayed, unmount } = setup({ initialValue: "12" })

  fireEvent.keyDown(cells[1], { key: "Backspace" })

  assert.equal(displayed(), "1")
  unmount()
})

test("빈 칸에서 Backspace를 누르면 앞 칸을 비우고 그리로 이동한다", () => {
  const { cells, displayed, focusedIndex, unmount } = setup({ initialValue: "12" })

  fireEvent.keyDown(cells[2], { key: "Backspace" })

  assert.equal(displayed(), "1")
  assert.equal(focusedIndex(), 1)
  unmount()
})

test("첫 칸이 비어 있을 때 Backspace는 아무 일도 하지 않는다", () => {
  const { cells, changes, displayed, unmount } = setup()

  fireEvent.keyDown(cells[0], { key: "Backspace" })

  assert.equal(displayed(), "")
  assert.deepEqual(changes, [])
  unmount()
})

test("영문자가 든 칸도 Backspace로 지워진다", () => {
  const { cells, displayed, unmount } = setup({ initialValue: "AB2C3D" })

  fireEvent.keyDown(cells[5], { key: "Backspace" })

  assert.equal(displayed(), "AB2C3")
  unmount()
})

test("ArrowLeft/ArrowRight로 칸 사이를 오간다", () => {
  const { cells, focusedIndex, unmount } = setup({ initialValue: "123456" })

  fireEvent.keyDown(cells[3], { key: "ArrowLeft" })
  assert.equal(focusedIndex(), 2)

  fireEvent.keyDown(cells[2], { key: "ArrowRight" })
  assert.equal(focusedIndex(), 3)
  unmount()
})

test("양 끝에서의 화살표는 범위를 벗어나지 않는다", () => {
  const { cells, focusedIndex, unmount } = setup({ initialValue: "123456" })

  cells[0].focus()
  fireEvent.keyDown(cells[0], { key: "ArrowLeft" })
  assert.equal(focusedIndex(), 0)

  cells[5].focus()
  fireEvent.keyDown(cells[5], { key: "ArrowRight" })
  assert.equal(focusedIndex(), 5)
  unmount()
})

test("autoFocus면 잠시 뒤 첫 칸에 포커스가 간다", async () => {
  const view = setup({ autoFocus: true })

  await act(async () => { await sleep(340) })

  assert.equal(view.focusedIndex(), 0)
  view.unmount()
})

test("readOnly·disabled면 autoFocus여도 포커스를 가져가지 않는다", async () => {
  for (const options of [{ readOnly: true }, { disabled: true }]) {
    const view = setup({ autoFocus: true, ...options })

    await act(async () => { await sleep(340) })

    assert.equal(view.focusedIndex(), -1, `포커스를 가져가면 안 된다: ${JSON.stringify(options)}`)
    view.unmount()
  }
})

test("autoFocus가 아니면 포커스를 옮기지 않는다", async () => {
  const view = setup()

  await act(async () => { await sleep(340) })

  assert.equal(view.focusedIndex(), -1)
  view.unmount()
})

test("칸의 inputMode는 숫자 전용 키패드를 부르지 않는다", () => {
  const { cells, unmount } = setup()

  for (const cell of cells) {
    const inputMode = cell.getAttribute("inputmode")
    assert.ok(
      inputMode && !["numeric", "decimal"].includes(inputMode),
      `숫자 전용 키패드를 강제한다: inputmode=${inputMode}`,
    )
  }
  unmount()
})

test("칸의 pattern은 영숫자 한 글자만 받는다", () => {
  const { cells, unmount } = setup()

  assert.equal(cells.length, CODE_LENGTH)

  for (const cell of cells) {
    const pattern = cell.getAttribute("pattern")
    assert.ok(pattern, "pattern이 없다")
    assert.equal(cell.getAttribute("maxlength"), "1")

    const cellPattern = new RegExp(`^(?:${pattern})$`)
    for (const char of "ABZ059") {
      assert.ok(cellPattern.test(char), `쓸 수 있는 글자를 막는다: ${char}`)
    }
    for (const value of [" ", "-", "가", "AB"]) {
      assert.ok(!cellPattern.test(value), `쓸 수 없는 값을 허용한다: ${value}`)
    }
  }
  unmount()
})

test("소문자를 쳐도 칸에 남는 값은 pattern을 만족한다", () => {
  const { cells, unmount } = setup()

  type(cells[0], "a")

  const cellPattern = new RegExp(`^(?:${cells[0].getAttribute("pattern")})$`)
  assert.ok(cellPattern.test(cells[0].value), `pattern을 벗어난 값: ${cells[0].value}`)
  unmount()
})

test("칸 수는 값 길이와 무관하게 항상 방코드 길이만큼이다", () => {
  const { cells, unmount } = setup({ initialValue: "AB" })

  assert.equal(cells.length, CODE_LENGTH)
  assert.equal(cells[2].value, "", "값이 없는 칸은 빈 문자열이어야 한다")
  unmount()
})
