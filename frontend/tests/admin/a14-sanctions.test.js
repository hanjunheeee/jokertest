// 관리자 제재 칸 시험: 정지 확인 창(대상·기간·사유 다시 보임, 영구면 기간 칸 없음), 사유 비면 단추 꺼짐, 플레이어에게 보이는 사유 글, 이미 정지 중, 기간 칸 경계
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-048~056, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-sanctions.test.js
import test from "node:test"
import assert from "node:assert/strict"
import {
  h, render, within, cleanup, type, press, settle, buttonNamed, dialog, callsOf, createFakeServer, MEMBER_UUID, memberOf,
} from "./a14-kit.mjs"

const { default: SanctionPanel } = await import("../../src/admin/domains/sanctions/components/SanctionPanel.jsx")

test.afterEach(() => cleanup())

const ACTIVE_BAN = {
  id: 3, active: true, isPermanent: false, startAt: "2026-11-10T00:00:00.000Z", endAt: "2026-11-17T00:00:00.000Z",
  reason: "욕설", bannedByLoginId: "ceo", liftReason: null, liftedByLoginId: null, liftedAt: null,
}

// 제재 칸 그리고 단추 하나 눌러 확인 창 열기
async function openDialog(buttonName, { bans = [] } = {}) {
  const server = createFakeServer()
  render(h(SanctionPanel, { member: memberOf(), bans, onChanged: () => {} }))
  await press(buttonNamed(buttonName))
  assert.ok(dialog() !== null, `"${buttonName}" 확인 창이 안 뜸`)
  return server
}
const inDialog = (name) => within(dialog()).queryByRole("button", { name }) ?? null
const reasonField = () => within(dialog()).getByLabelText(/사유/)

test("A14-F-048 정지 확인 창: 대상 닉네임·기간 \"7일\"·사유가 다시 보임", async () => {
  await openDialog("기간 정지")
  await type(reasonField(), "욕설 반복")
  const text = dialog().textContent
  assert.match(text, /대상: 가면1/)
  assert.match(text, /기간: 7일/)
  assert.match(text, /사유: 욕설 반복/)
})

test("A14-F-049 정지 확인 창: 영구 고름 → 기간 칸 없음, \"영구 정지\"", async () => {
  await openDialog("영구 정지")
  assert.equal(within(dialog()).queryByLabelText("정지 일수"), null)
  assert.match(dialog().textContent, /영구 정지/)
  assert.match(dialog().textContent, /기간: 영구/)
})

// 사유 비면 확인 단추 꺼짐 (값 3), 사유 넣으면 켜짐
const REASON_CASES = [
  ["A14-F-050", "정지", "기간 정지", "정지하기", []],
  ["A14-F-051", "해제", "제재 해제", "해제하기", [ACTIVE_BAN]],
  ["A14-F-052", "강제 종료", "강제 접속 종료", "접속 끊기", []],
]
for (const [no, name, opener, confirm, bans] of REASON_CASES) {
  test(`${no} 사유 비면 단추 꺼짐: ${name} 사유 빔 → "${confirm}" 꺼짐`, async () => {
    const server = await openDialog(opener, { bans })
    assert.equal(inDialog(confirm).disabled, true)
    // 빈칸만 넣어도 빈 사유
    await type(reasonField(), "   ")
    assert.equal(inDialog(confirm).disabled, true)
    await press(inDialog(confirm))
    assert.equal(server.calls.filter((c) => c.method !== "GET").length, 0)
    await type(reasonField(), "운영 정책 위반")
    assert.equal(inDialog(confirm).disabled, false)
  })
}

test("A14-F-053 플레이어에게 보이는 사유: 정지 사유 칸에 \"플레이어에게 보이는 사유\" 글", async () => {
  await openDialog("기간 정지")
  const field = within(dialog()).getByLabelText(/플레이어에게 보이는 사유/)
  assert.equal(field.tagName, "TEXTAREA")
})

test("A14-F-054 이미 정지 중: 409 ALREADY_BANNED → 기간 바꾸기 안내", async () => {
  const server = await openDialog("기간 정지")
  server.answer(`POST /admin-api/members/${MEMBER_UUID}/bans`, 409, {
    ok: false, code: "ALREADY_BANNED", message: "이미 정지 중이에요. 기간을 바꾸려면 \"기간 바꾸기\"를 써 주세요.", banId: 3,
  })
  await type(reasonField(), "욕설 반복")
  await press(inDialog("정지하기"))
  await settle()
  const alert = within(dialog()).queryByRole("alert")
  assert.ok(alert !== null, "거절 글이 없음")
  assert.match(alert.textContent, /기간 바꾸기/)
  assert.equal(callsOf(server, "POST", `/admin-api/members/${MEMBER_UUID}/bans`).length, 1)
})

// 정지 기간 칸 경계 (값 2): 1~3650일 밖이면 확인 단추 꺼짐 + 칸 오류 글
const DAYS_CASES = [
  ["A14-F-055", "0"],
  ["A14-F-056", "3651"],
]
for (const [no, days] of DAYS_CASES) {
  test(`${no} 정지 기간 칸 경계: ${days} 넣음 → 확인 단추 꺼짐, 칸 오류 글`, async () => {
    await openDialog("기간 정지")
    await type(reasonField(), "욕설 반복")
    await type(within(dialog()).getByLabelText("정지 일수"), days)
    assert.equal(inDialog("정지하기").disabled, true)
    assert.match(dialog().textContent, /1~3650일 사이로 넣어 주세요\./)
    // 경계 안(3650)으로 바꾸면 켜짐
    await type(within(dialog()).getByLabelText("정지 일수"), "3650")
    assert.equal(inDialog("정지하기").disabled, false)
  })
}

