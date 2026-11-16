// 화면 부품 시험: 추방 창 — 줄 "추방" 한 번 = 바로 보냄(확인 칸 없음)·안내 글·실패 글과 색·결과 모름·빈 목록·보내는 줄·줄 수·키보드·크기
// 목록 A01-F-604~635·708~720·723~724 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/kick-modal.test.js
// jsdom은 그림을 안 그림 → 색은 "클래스로 정해 둔 글자색·바탕색이 서로 다르고 대비가 큼"까지만 봄, 진짜 보이는지는 브라우저 시험(E·H) 몫
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, cleanup, within } = await import("@testing-library/react")
const { default: Shell } = await import("../../src/domains/game/ingame/components/controls/kickPlayer/SettingKickPlayerModalShell.jsx")
const { default: Content } = await import("../../src/domains/game/ingame/components/controls/kickPlayer/SettingKickPlayerModalContent.jsx")
const { KICK_REQUEST_STATUS: S } = await import("../../src/domains/game/ingame/constants/ingameKick.js")
const { tabbables, pressEnter, classColor, contrast } = await import("./a01b-helpers.mjs")

const h = React.createElement
test.afterEach(() => cleanup())

// 대상 n명 (닉네임·자리 번호)
const targetsOf = (n) => Array.from({ length: n }, (_, i) => ({ uuid: `guest-${i + 1}`, nickname: `손님${i + 1}`, membershipId: `m-guest-${i + 1}` }))

// 창 그리기, 누른 대상·결과 묻기 누름을 모음
function draw(props = {}) {
  const kicked = []
  let lookups = 0
  const view = render(h(Shell, { open: true, onClose: () => {} },
    h(Content, {
      targets: targetsOf(4),
      onRequestConfirm: (target) => kicked.push(target),
      onLookupResult: () => { lookups += 1 },
      ...props,
    })))
  return { view, kicked, lookups: () => lookups }
}

const dialog = () => screen.getByRole("dialog", { name: "플레이어 추방" })
const kickButtons = () => within(dialog()).getAllByRole("button", { name: /^추방/ })

// 칸에 밝은 글자·어두운 바탕 색이 클래스로 정해졌는지 (같은 값이면 안 보임)
function assertReadableColors(el, label) {
  const fg = classColor(el.className, "text")
  const bg = classColor(el.className, "bg")
  assert.ok(fg, `${label}: 글자색 클래스 없음 (${el.className})`)
  assert.ok(bg, `${label}: 바탕색 클래스 없음 (${el.className})`)
  assert.notEqual(fg, bg, `${label}: 글자색과 바탕색이 같음`)
  assert.ok(contrast(fg, bg) >= 4.5, `${label}: 대비 ${contrast(fg, bg).toFixed(2)} (4.5 밑)`)
  assert.equal(el.hidden, false)
  assert.equal(el.closest("[aria-hidden='true']"), null)
}

test("A01-F-604 [버그 7] 대상 줄 \"추방\" 클릭 1번 → 보내기 함수 1번(그 대상), 창에 \"취소\" 단추 0개·확인 칸 0개", () => {
  const { kicked } = draw()
  fireEvent.click(kickButtons()[1])
  assert.equal(kicked.length, 1)
  assert.equal(kicked[0].uuid, "guest-2")
  assert.equal(within(dialog()).queryAllByRole("button", { name: /취소/ }).length, 0)
  assert.equal(within(dialog()).queryAllByRole("checkbox").length, 0)
  assert.equal(within(dialog()).queryAllByRole("alertdialog").length, 0)
  assert.doesNotMatch(dialog().textContent, /추방하시겠습니까/)
})

test("A01-F-605 창 안내 글 \"추방을 누르면 확인 없이 바로 내보냅니다.\"", () => {
  draw()
  assert.ok(within(dialog()).getByText("추방을 누르면 확인 없이 바로 내보냅니다."))
})

test("A01-F-606 제목 \"플레이어 추방\", 소제목 \"추방할 플레이어를 선택하세요.\"", () => {
  draw()
  assert.ok(within(dialog()).getByRole("heading", { name: "플레이어 추방" }))
  assert.ok(within(dialog()).getByText("추방할 플레이어를 선택하세요."))
})

// 대표 실패 코드 (글은 F-501~521과 같은 것)
const FAIL_CASES = [
  ["A01-F-607", "ALREADY_LEFT", "이미 방에서 나간 참가자입니다."],
  ["A01-F-608", "STALE_MEMBERSHIP", "참가자 목록이 바뀌었습니다"],
  ["A01-F-609", "ADMISSION_PENDING", "입장 처리가 아직 끝나지 않았습니다"],
  ["A01-F-610", "ROOM_NOT_FOUND", "방 정보가 바뀌었습니다. 창을 닫았다가 다시 열어주세요."],
  ["A01-F-611", "NOT_IN_ROOM", "지금 방에 들어와 있지 않습니다"],
  ["A01-F-612", "NOT_HOST", "방장만 추방할 수 있습니다."],
  ["A01-F-613", "NO_RESPONSE", "서버 응답이 없습니다. 결과를 확인한 뒤"],
  ["A01-F-614", "XYZ", "추방하지 못했습니다. 다시 시도해주세요."],
]
for (const [id, code, text] of FAIL_CASES) {
  test(`${id} 상태 실패 + 코드 ${code} → kick-error 글 "${text}…", data-kick-error-code = ${code}`, () => {
    draw({ status: S.FAILED, errorCode: code })
    const box = screen.getByTestId("kick-error")
    assert.ok(box.textContent.startsWith(text), `받은 글: ${box.textContent}`)
    assert.equal(box.getAttribute("data-kick-error-code"), code)
  })
}

test("A01-F-615 [버그 7] kick-error에 글자색·바탕색 클래스 둘 다(밝은 글자 #ffc9bf · 어두운 붉은 바탕), 기본 검정 글자 아님", () => {
  draw({ status: S.FAILED, errorCode: "ALREADY_LEFT" })
  const box = screen.getByTestId("kick-error")
  assert.equal(classColor(box.className, "text"), "#ffc9bf")
  const bg = classColor(box.className, "bg")
  assert.ok(bg, "바탕색 클래스 없음")
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16))
  assert.ok(r > g && r > b && r < 0x80, `어두운 붉은 바탕 아님: ${bg}`)
  assertReadableColors(box, "kick-error")
})

test("A01-F-616 실패 글 칸 role=\"alert\"", () => {
  draw({ status: S.FAILED, errorCode: "NOT_HOST" })
  assert.equal(screen.getByTestId("kick-error").getAttribute("role"), "alert")
})

test("A01-F-617 상태 UNKNOWN + 영수증 → kick-unknown \"결과를 확인할 수 없습니다…\" + \"결과 확인\" 단추", () => {
  draw({ status: S.UNKNOWN, canLookupResult: true })
  assert.ok(screen.getByTestId("kick-unknown").textContent.startsWith("결과를 확인할 수 없습니다"))
  assert.ok(within(dialog()).getByRole("button", { name: "결과 확인" }))
})

test("A01-F-618 \"결과 확인\" 클릭 → 결과 묻기 함수 1번", () => {
  const { lookups } = draw({ status: S.UNKNOWN, canLookupResult: true })
  fireEvent.click(within(dialog()).getByRole("button", { name: "결과 확인" }))
  assert.equal(lookups(), 1)
})

test("A01-F-619 상태 SENDING → kick-lookup-result 없음", () => {
  draw({ status: S.SENDING, canLookupResult: true, isSending: true, pendingTarget: targetsOf(1)[0] })
  assert.equal(screen.queryByTestId("kick-lookup-result"), null)
})

test("A01-F-620 상태 SUCCEEDED → 결과 확인 단추 없음", () => {
  draw({ status: S.SUCCEEDED, canLookupResult: true })
  assert.equal(screen.queryByTestId("kick-lookup-result"), null)
})

test("A01-F-621 목록 다시 확인 중 → kick-awaiting-resolution \"현재 참가자 목록을 서버에서 다시 확인하는 중입니다…\"", () => {
  draw({ status: S.UNKNOWN, isAwaitingResolution: true })
  assert.ok(screen.getByTestId("kick-awaiting-resolution").textContent.startsWith("현재 참가자 목록을 서버에서 다시 확인하는 중입니다"))
})

test("A01-F-622 혼자 있는 방 (정원 5 · 1명) → kick-empty-targets \"추방할 수 있는 참가자가 없습니다.\"", () => {
  draw({ targets: [] })
  assert.equal(screen.getByTestId("kick-empty-targets").textContent, "추방할 수 있는 참가자가 없습니다.")
  assert.equal(within(dialog()).queryAllByRole("button", { name: /^추방/ }).length, 0)
})

test("A01-F-623 [버그 7] kick-empty-targets에 밝은 글자·어두운 바탕 클래스", () => {
  draw({ targets: [] })
  assertReadableColors(screen.getByTestId("kick-empty-targets"), "kick-empty-targets")
})

test("A01-F-624 보내는 대상 줄 → 단추 글 \"보내는 중\", 읽기 이름 \"추방 보내는 중\"", () => {
  const targets = targetsOf(4)
  draw({ targets, status: S.SENDING, isSending: true, pendingTarget: targets[2] })
  const pending = within(dialog()).getByRole("button", { name: "추방 보내는 중" })
  assert.equal(pending.textContent, "보내는 중")
  assert.ok(pending.closest("li").textContent.includes("손님3"))
})

test("A01-F-625 보내는 중 → 다른 줄 \"추방\" 단추 disabled", () => {
  const targets = targetsOf(4)
  draw({ targets, status: S.SENDING, isSending: true, pendingTarget: targets[0] })
  const others = within(dialog()).getAllByRole("button", { name: "추방" })
  assert.equal(others.length, 3)
  for (const button of others) assert.equal(button.disabled, true)
})

// 정원마다 꽉 찬 방 → 대상 줄 = 인원 − 1
for (const [id, max] of [["A01-F-626", 5], ["A01-F-627", 6], ["A01-F-628", 7], ["A01-F-629", 8], ["A01-F-630", 9], ["A01-F-631", 10]]) {
  test(`${id} 정원 ${max} 꽉 찬 방 → 줄 ${max - 1}개, 줄마다 닉네임·"추방" 단추`, () => {
    draw({ targets: targetsOf(max - 1) })
    const rows = within(dialog()).getAllByRole("listitem")
    assert.equal(rows.length, max - 1)
    rows.forEach((row, i) => {
      assert.ok(row.textContent.includes(`손님${i + 1}`))
      assert.ok(within(row).getByRole("button", { name: "추방" }))
    })
  })
}

test("A01-F-632 같은 닉네임 두 사람 → 줄 2개, 보내는 표시는 자리 번호 같은 줄만", () => {
  const twins = [
    { uuid: "guest-a", nickname: "같은이름", membershipId: "m-a" },
    { uuid: "guest-b", nickname: "같은이름", membershipId: "m-b" },
  ]
  draw({ targets: twins, status: S.SENDING, isSending: true, pendingTarget: { uuid: "guest-b", membershipId: "m-b" } })
  const rows = within(dialog()).getAllByRole("listitem")
  assert.equal(rows.length, 2)
  assert.equal(within(rows[0]).queryByRole("button", { name: "추방 보내는 중" }), null)
  assert.ok(within(rows[1]).getByRole("button", { name: "추방 보내는 중" }))
})

test("A01-F-633 목록 읽기 이름 \"추방 대상 플레이어 목록\"", () => {
  draw()
  assert.ok(within(dialog()).getByRole("list", { name: "추방 대상 플레이어 목록" }))
})

test("A01-F-634 실패 글 있는 채 다른 줄 클릭 → 보내기 함수 1번", () => {
  const { kicked } = draw({ status: S.FAILED, errorCode: "ALREADY_LEFT" })
  fireEvent.click(kickButtons()[3])
  assert.equal(kicked.length, 1)
  assert.equal(kicked[0].uuid, "guest-4")
})

test("A01-F-635 상태 IDLE → kick-error·kick-unknown 없음", () => {
  draw({ status: S.IDLE })
  assert.equal(screen.queryByTestId("kick-error"), null)
  assert.equal(screen.queryByTestId("kick-unknown"), null)
})

// 나머지 실패 코드도 창에 글 (글은 F-501~521의 그 코드 글)
const REST_CASES = [
  ["A01-F-708", "NOT_CONNECTED", "서버와 연결되어 있지 않습니다"],
  ["A01-F-709", "NOT_READY", "방 정보가 아직 다 오지 않았습니다"],
  ["A01-F-710", "VERIFY_FAILED", "참가자 목록을 다시 확인하지 못했습니다"],
  ["A01-F-711", "STALE_SOCKET", "연결이 바뀌었습니다"],
  ["A01-F-712", "STALE_BOOT", "서버가 다시 시작되었습니다"],
  ["A01-F-713", "RECEIPT_CAPACITY", "추방 요청이 너무 많습니다"],
  ["A01-F-714", "REQUEST_ID_REUSED", "같은 요청이 이미 처리되었습니다"],
  ["A01-F-715", "SELF_KICK", "자기 자신은 추방할 수 없습니다."],
  ["A01-F-716", "ALREADY_IN_GAME", "게임이 이미 시작되어 추방할 수 없습니다."],
  ["A01-F-717", "INVALID_REQUEST", "요청 내용이 맞지 않습니다"],
  ["A01-F-718", "INTERNAL_ERROR", "서버에서 문제가 생겼습니다"],
]
for (const [id, code, text] of REST_CASES) {
  test(`${id} [버그 7] 상태 실패 + ${code} → kick-error 글 "${text}…"`, () => {
    draw({ status: S.FAILED, errorCode: code })
    const box = screen.getByTestId("kick-error")
    assert.ok(box.textContent.startsWith(text), `받은 글: ${box.textContent}`)
    assert.doesNotMatch(box.textContent, /[A-Z_]{4,}/)
  })
}

test("A01-F-719 Tab으로 \"추방\" 단추에 닿고 Enter → 보내기 함수 1번 (jsdom 흉내, 진짜 키보드는 브라우저 몫)", () => {
  const { kicked } = draw()
  const first = kickButtons()[0]
  assert.ok(tabbables().includes(first), "Tab 차례에 없음")
  pressEnter(first)
  assert.equal(document.activeElement, first)
  assert.equal(kicked.length, 1)
  assert.equal(kicked[0].uuid, "guest-1")
})

test("A01-F-720 \"결과 확인\"에 Enter → 결과 묻기 1번", () => {
  const { lookups } = draw({ status: S.UNKNOWN, canLookupResult: true })
  const button = within(dialog()).getByRole("button", { name: "결과 확인" })
  assert.ok(tabbables().includes(button), "Tab 차례에 없음")
  pressEnter(button)
  assert.equal(lookups(), 1)
})

test("A01-F-723 대상 9명 (정원 10) → 마지막 줄까지 목록(스크롤 칸) 안에 있음", () => {
  draw({ targets: targetsOf(9) })
  const list = within(dialog()).getByRole("list", { name: "추방 대상 플레이어 목록" })
  assert.match(list.className, /overflow-y-auto/)
  const rows = within(list).getAllByRole("listitem")
  assert.equal(rows.length, 9)
  assert.ok(list.contains(rows[8]))
  assert.ok(within(rows[8]).getByRole("button", { name: "추방" }))
})

test("A01-F-724 \"결과 확인\" 단추 최소 높이 클래스 2.25rem 이상", () => {
  draw({ status: S.UNKNOWN, canLookupResult: true })
  const button = within(dialog()).getByRole("button", { name: "결과 확인" })
  const m = button.className.match(/(?:^|\s)min-h-\[([\d.]+)rem\]/)
  assert.ok(m, `최소 높이 클래스 없음 (${button.className})`)
  assert.ok(Number(m[1]) >= 2.25, `최소 높이 ${m[1]}rem`)
})
