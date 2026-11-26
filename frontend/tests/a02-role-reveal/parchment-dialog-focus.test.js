// 양피지 대화상자(ParchmentTextDialog) 초점 이동·Tab 가두기·닫힘 뒤 초점 되돌리기 시험
// 돌리기(frontend): node --experimental-test-module-mocks --test tests/a02-role-reveal/parchment-dialog-focus.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const RTL = await import("@testing-library/react")
const { default: ParchmentTextDialog } = await import("../../src/shared/ui/dialog/ParchmentTextDialog.jsx")

const h = React.createElement

test.afterEach(() => RTL.cleanup())

// 비교엔 참거짓만 넣음 (jsdom 요소를 넣으면 실패 글 만들다 멈춤)
test("양피지 대화상자 열림 → 창 안 첫 단추로 초점 이동, Tab·Shift+Tab이 창 안에서만 돌고 닫히면 연 단추로 복귀", () => {
  function Harness() {
    const [open, setOpen] = React.useState(false)
    return h(
      "div",
      null,
      h("button", { type: "button", onClick: () => setOpen(true) }, "창 열기"),
      h(
        ParchmentTextDialog,
        { open, title: "약관 안내", onClose: () => setOpen(false) },
        h("button", { type: "button" }, "첫 단추"),
        h("button", { type: "button" }, "끝 단추"),
      ),
    )
  }

  RTL.render(h(Harness))
  const opener = RTL.screen.getByRole("button", { name: "창 열기" })
  opener.focus()
  assert.equal(document.activeElement === opener, true)

  RTL.fireEvent.click(opener)
  const dialog = RTL.screen.getByRole("dialog", { name: "약관 안내" })
  const first = RTL.within(dialog).getByRole("button", { name: "첫 단추" })
  const last = RTL.within(dialog).getByRole("button", { name: "끝 단추" })

  // 열리자마자 창 안 첫 단추로 초점이 옮겨짐
  assert.equal(document.activeElement === first, true, "열렸을 때 첫 단추로 초점이 안 옮겨짐")

  // 첫 단추에서 Shift+Tab → 끝 단추로 가둠
  const shiftTabCancelled = !RTL.fireEvent.keyDown(window, { key: "Tab", shiftKey: true })
  assert.equal(shiftTabCancelled, true, "Shift+Tab 기본 동작이 안 막힘")
  assert.equal(document.activeElement === last, true, "Shift+Tab이 끝 단추로 안 감")

  // 끝 단추에서 Tab → 첫 단추로 가둠
  const tabCancelled = !RTL.fireEvent.keyDown(window, { key: "Tab", shiftKey: false })
  assert.equal(tabCancelled, true, "Tab 기본 동작이 안 막힘")
  assert.equal(document.activeElement === first, true, "Tab이 첫 단추로 안 감")

  // Esc로 닫으면 열기 전 단추로 초점 복귀
  RTL.fireEvent.keyDown(window, { key: "Escape" })
  assert.equal(RTL.screen.queryByRole("dialog", { name: "약관 안내" }) === null, true)
  assert.equal(document.activeElement === opener, true, "닫힌 뒤 연 단추로 초점이 안 돌아옴")
})

test("양피지 대화상자에 누를 자식이 없어도 대화상자 자체로 초점을 옮기고 Tab을 가둠", () => {
  RTL.render(
    h(
      ParchmentTextDialog,
      { open: true, title: "빈 안내", closable: false },
      h("p", null, "읽기 전용 본문"),
    ),
  )
  const dialog = RTL.screen.getByRole("dialog", { name: "빈 안내" })
  assert.equal(document.activeElement === dialog, true, "대화상자 자체로 초점이 안 옮겨짐")
  const cancelled = !RTL.fireEvent.keyDown(window, { key: "Tab" })
  assert.equal(cancelled, true)
  assert.equal(document.activeElement === dialog, true)
})
