// 친구 추가 탭 검색·친구 신청 시험 (누른 검색어일 때만 결과·줄마다 실패 글·보내는 중 다시 안 보냄·결과 없음·신청 단추 이름)
// 목록 A13-F-022~025·215~218 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a13-social/friend-search.test.js
// 목록 파일 칸의 friend-search.test.jsx(부품 줄)도 이 파일에 같이 둠 (npm test가 .test.js만 돌려서)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { screen, within, fireEvent, act } = await import("@testing-library/react")
const { installFetch, signIn, resetAll, openPanel, openTab, press, typeInto, settle, HOLD } = await import("./a13Kit.mjs")

test.afterEach(() => resetAll())

// 검색 결과 사람 (가람·지유)
const PEOPLE = [
  { id: "c-a", name: "가람", status: "ONLINE" },
  { id: "c-b", name: "지유", status: "OFFLINE" },
]

const searchBox = () => screen.getByRole("searchbox")
const resultRows = () => [...document.querySelectorAll("li[data-candidate-id]")]
const rowOf = (id) => document.querySelector(`li[data-candidate-id="${id}"]`)

// 친구 추가 탭을 열고 검색어를 넣어 Enter로 검색
async function searchFor(query, { results = PEOPLE, routes = {} } = {}) {
  signIn()
  const http = installFetch({ "GET /friends/search": { body: { data: results } }, ...routes })
  await openPanel()
  await openTab("친구 추가")
  await typeInto(searchBox(), query)
  await act(async () => { fireEvent.keyDown(searchBox(), { key: "Enter", code: "Enter" }); await settle(8) })
  return http
}

test("A13-F-022 검색 누른 뒤 → 결과 보임", async () => {
  await searchFor("가")
  assert.deepEqual(resultRows().map((li) => li.getAttribute("data-candidate-id")), ["c-a", "c-b"])
})

test("A13-F-023 검색어를 바꾸고 안 누름 → 결과·\"없음\" 숨김", async () => {
  await searchFor("가")
  await typeInto(searchBox(), "가나")
  assert.equal(resultRows().length, 0)
  assert.equal(screen.queryByText("검색 결과가 없습니다."), null)
})

test("A13-F-024 A 신청 실패(409) · B 성공 → A 줄에만 글", async () => {
  await searchFor("가", {
    routes: {
      "POST /friends/requests": (body) => (body.receiverId === "c-a"
        ? { status: 409, body: { message: "이미 친구 신청 중입니다." } }
        : { status: 201, body: { data: { ok: true } } }),
    },
  })
  await press(screen.getByRole("button", { name: "가람에게 친구 신청" }))
  await press(screen.getByRole("button", { name: "지유에게 친구 신청" }))
  assert.equal(within(rowOf("c-a")).queryByRole("alert")?.textContent, "이미 친구 신청 중입니다.")
  assert.equal(within(rowOf("c-b")).queryByRole("alert"), null)
})

test("A13-F-025 A 신청 답 오기 전에 A 다시 → 요청 1번", async () => {
  const http = await searchFor("가", { routes: { "POST /friends/requests": HOLD } })
  const button = screen.getByRole("button", { name: "가람에게 친구 신청" })
  await press(button)
  await press(button)
  assert.equal(http.to("POST", "/friends/requests").length, 1)
  await http.release("POST", "/friends/requests", { status: 201, body: { data: { ok: true } } })
})

test("A13-F-215 검색 누름 → 0명 → \"검색 결과가 없습니다.\"", async () => {
  await searchFor("없는사람", { results: [] })
  assert.ok(screen.getByText("검색 결과가 없습니다."))
})

test("A13-F-216 신청 보내기 전 단추 읽기 이름 → \"지유에게 친구 신청\"", async () => {
  await searchFor("지유", { results: [PEOPLE[1]] })
  assert.ok(within(rowOf("c-b")).getByRole("button", { name: "지유에게 친구 신청" }))
})

test("A13-F-217 신청 보낸 뒤 단추 읽기 이름 → \"신청 완료\"", async () => {
  await searchFor("지유", { results: [PEOPLE[1]], routes: { "POST /friends/requests": { status: 201, body: { data: { ok: true } } } } })
  await press(screen.getByRole("button", { name: "지유에게 친구 신청" }))
  assert.ok(within(rowOf("c-b")).getByRole("button", { name: "신청 완료" }))
})

test("A13-F-218 A 줄 신청 실패 → 실패 글이 A 줄 안에", async () => {
  await searchFor("가", { routes: { "POST /friends/requests": { status: 409, body: { message: "이미 친구 신청 중입니다." } } } })
  await press(screen.getByRole("button", { name: "가람에게 친구 신청" }))
  const alert = screen.getByRole("alert")
  assert.ok(rowOf("c-a").contains(alert))
  assert.equal(rowOf("c-b").contains(alert), false)
})
