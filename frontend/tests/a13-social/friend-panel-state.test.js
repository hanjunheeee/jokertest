// 친구 목록 패널 상태 시험 ("일반" 폴더 수·목록 안 글자 거르기·받기/거절/차단/풀기 실패 글·모두 받기 뒤 다시 받기 실패)
// 목록 A13-F-018~021·026~030 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/friend-panel-state.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { screen, within } = await import("@testing-library/react")
const { installFetch, signIn, resetAll, friend, openPanel, openTab, press, typeInto } = await import("./a13Kit.mjs")

test.afterEach(() => resetAll())

// 화면에 보이는 폴더 이름 글 (예: ["일반 (1/3)", "오프라인 (2)", "즐겨찾기 (2)"])
const folderLabels = () => [...document.querySelectorAll("button[aria-expanded] span")].map((el) => el.textContent)
// 보이는 친구 줄 이름
const friendNames = () => [...document.querySelectorAll("li[data-friend-id]")].map((li) => li.querySelector("p").textContent)
// 받은 신청 줄 이름
const requestNames = () => [...document.querySelectorAll("li[data-request-id]")].map((li) => li.querySelector("p").textContent)
const searchBox = () => screen.getByRole("searchbox")

// 받은 신청 둘 (가람·나래)
const REQUESTS = [
  { request_id: 11, id: "u-ga", name: "가람", accountProfilePhotoId: null, accountProfileBorderId: null },
  { request_id: 12, id: "u-na", name: "나래", accountProfilePhotoId: null, accountProfileBorderId: null },
]

test("A13-F-018 친구 5명(즐겨찾기 2, 일반 3 중 접속 1) → \"일반 (1/3)\"", async () => {
  signIn()
  installFetch({
    "GET /friends": { body: { data: [
      friend("f1", "가람", true), friend("f2", "나래", false), friend("f3", "다솜", false),
      friend("f4", "라온", true), friend("f5", "마루", false),
    ] } },
    "GET /friends/favorites": { body: { data: ["f4", "f5"] } },
  })
  await openPanel()
  assert.ok(folderLabels().includes("일반 (1/3)"), `폴더 이름: ${folderLabels().join(", ")}`)
})

test("A13-F-019 친구 0명 → \"일반 (0/0)\"", async () => {
  signIn()
  installFetch()
  await openPanel()
  assert.ok(folderLabels().includes("일반 (0/0)"), `폴더 이름: ${folderLabels().join(", ")}`)
})

test("A13-F-020 친구 탭 \"지유\" → 이름으로만 거름 (id에 든 글자로는 안 걸림)", async () => {
  signIn()
  installFetch({
    "GET /friends": { body: { data: [friend("지유-아이디", "가람", true), friend("f2", "지유", true), friend("f3", "다솜", true)] } },
  })
  await openPanel()
  await typeInto(searchBox(), "지유")
  assert.deepEqual(friendNames(), ["지유"])
})

test("A13-F-021 받은 신청 탭 \"지유\" → 이름·id 둘 다로 거름", async () => {
  signIn()
  installFetch({
    "GET /friends/requests/incoming": { body: { data: [
      { request_id: 1, id: "u-지유", name: "가람" },
      { request_id: 2, id: "u-2", name: "지유" },
      { request_id: 3, id: "u-3", name: "다솜" },
    ] } },
  })
  await openPanel()
  await openTab("요청 수락")
  await typeInto(searchBox(), "지유")
  assert.deepEqual(requestNames(), ["가람", "지유"])
})

test("A13-F-026 받기 실패 → 그 줄에 \"수락하지 못했습니다. 다시 시도해 주세요.\"", async () => {
  signIn()
  installFetch({
    "GET /friends/requests/incoming": { body: { data: REQUESTS } },
    "PUT /friends/requests/11/accept": { status: 500, body: { message: "서버 오류" } },
  })
  await openPanel()
  await openTab("요청 수락")
  await press(screen.getByRole("button", { name: "가람 수락" }))
  const row = document.querySelector('li[data-request-id="11"]')
  assert.equal(within(row).getByRole("alert").textContent, "수락하지 못했습니다. 다시 시도해 주세요.")
})

test("A13-F-027 거절 실패 → 그 줄에 \"거절하지 못했습니다. 다시 시도해 주세요.\"", async () => {
  signIn()
  installFetch({
    "GET /friends/requests/incoming": { body: { data: REQUESTS } },
    "PUT /friends/requests/12/decline": { status: 500, body: { message: "서버 오류" } },
  })
  await openPanel()
  await openTab("요청 수락")
  await press(screen.getByRole("button", { name: "나래 거절" }))
  const row = document.querySelector('li[data-request-id="12"]')
  assert.equal(within(row).getByRole("alert").textContent, "거절하지 못했습니다. 다시 시도해 주세요.")
})

test("A13-F-028 친구 줄 차단 실패 → \"차단하지 못했습니다.\"", async () => {
  signIn()
  installFetch({
    "GET /friends": { body: { data: [friend("f1", "가람", true)] } },
    "POST /friends/blocks": { status: 500, body: {} },
  })
  await openPanel()
  await press(screen.getByRole("button", { name: "가람 차단" }))
  const row = document.querySelector('li[data-friend-id="f1"]')
  assert.equal(row.querySelector("[data-block-error]")?.textContent, "차단하지 못했습니다.")
})

test("A13-F-029 차단 풀기 실패 → \"차단을 해제하지 못했습니다.\"", async () => {
  signIn()
  installFetch({
    "GET /friends/blocks": { body: { data: [{ id: "b1", name: "나래" }] } },
    "DELETE /friends/blocks/b1": { status: 500, body: {} },
  })
  await openPanel()
  await openTab("차단 목록")
  await press(screen.getByRole("button", { name: "나래 차단 해제" }))
  const row = document.querySelector('li[data-blocked-id="b1"]')
  assert.equal(within(row).getByRole("alert").textContent, "차단을 해제하지 못했습니다.")
})

test("A13-F-030 모두 받기 성공 + 친구·받은 신청 다시 받기 둘 다 실패 → 안내 글", async () => {
  signIn()
  // 패널 열 때 첫 번째 받기만 됨, 그다음부터 실패
  installFetch({
    "GET /friends": (_body, count) => (count === 1 ? { body: { data: [] } } : { status: 500, body: { message: "x" } }),
    "GET /friends/requests/incoming": (_body, count) => (count === 1 ? { body: { data: REQUESTS } } : { status: 500, body: { message: "x" } }),
    "PUT /friends/requests/11/accept": { body: { data: { ok: true } } },
    "PUT /friends/requests/12/accept": { body: { data: { ok: true } } },
  })
  await openPanel()
  await openTab("요청 수락")
  await press(screen.getByRole("button", { name: "전부 수락" }))
  const line = document.querySelector("[data-accept-all-refresh-error]")
  assert.equal(line?.textContent, "친구 목록·받은 요청 목록을 새로 불러오지 못했습니다.")
})
