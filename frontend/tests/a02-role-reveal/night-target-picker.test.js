// 밤 대상 고르기 시험(jsdom): 내 밤 차례 판 화면을 그려 동료 카드 메뉴의 밤 단추·거절 글·대상 이름을 화면으로 봄 (화면 부품)
// 목록 A02-F-193~200 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md)
import test from "node:test"
import assert from "node:assert/strict"
import {
  RTL, cardOf, dismissOverlays, installSocket, loginAs, renderInGamePage, resetAll, useInGameStore, waitUntil,
} from "./a02Render.mjs"
import { buildGameStarted, buildSnapshot, nextGameId, ofRole, seatCode } from "./a02Fixtures.mjs"

test.afterEach(() => resetAll())

// 직업마다 2명 판 (6명), 상대 닉네임은 "민수"
const PAIR_CODES = { JOKER: "J2C4", DOCTOR: "J1D2C3", GUARD: "J1G2C3", WITCH_HUNTER: "J1W2C3" }
function pairWithMinsu(role, tag) {
  const seats = seatCode(PAIR_CODES[role], { gameTag: tag })
  const [me, partner] = ofRole(seats, role)
  const holder = seats.find((p) => p.nickname === "민수")
  if (holder && holder !== partner) holder.nickname = partner.nickname
  partner.nickname = "민수"
  return { seats, me, partner }
}

// 내 밤 차례 판 화면 (시작 알림 → 밤 스냅샷, 마녀사냥꾼은 2일째), 뜬 안내 창은 다 닫음
async function myNightPage(seats, me, { alive = {}, ackReply } = {}) {
  const socket = installSocket({ ackReply })
  loginAs(me)
  const gameId = nextGameId("picker")
  const dayIndex = me.role === "WITCH_HUNTER" ? 2 : 1
  RTL.act(() => { useInGameStore.getState().setGamePayload(buildGameStarted(seats, me, { gameId })) })
  RTL.act(() => {
    useInGameStore.getState().applySessionSnapshot(buildSnapshot(seats, me, {
      gameId, phase: "NIGHT", dayIndex, alive,
      extra: { nightTurnRole: me.role, nightTurnDeadline: Date.now() + 30_000 },
    }))
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  renderInGamePage()
  await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) })
  await dismissOverlays()
  return { socket, gameId }
}

// 단추에 보이는 글
const shownLabel = (button) => button.querySelector("span")?.textContent ?? ""

// 카드를 눌러 연 메뉴의 단추들 (메뉴가 안 뜨면 빈 목록)
async function openMenu(nickname) {
  RTL.fireEvent.click(cardOf(nickname))
  await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  const menu = RTL.screen.queryByRole("menu", { name: "플레이어 행동" })
  return menu ? RTL.within(menu).queryAllByRole("menuitem") : []
}
// 광대 비교용: 시민 카드엔 암살 단추가 눌러짐 (조작이 막혀서 비어 보이는 것과 가르기), 확인 뒤 메뉴 닫음
async function assertCanActOnCitizen(seats) {
  const citizen = ofRole(seats, "CITIZEN")[0]
  const control = (await openMenu(citizen.nickname)).find((b) => shownLabel(b) === "암살")
  assert.ok(Boolean(control) && control.disabled === false, "시민 카드엔 암살 단추 눌러짐")
  RTL.fireEvent.click(cardOf(citizen.nickname))
  await RTL.act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  assert.equal(RTL.screen.queryByRole("menu", { name: "플레이어 행동" }) === null, true, "메뉴 닫힘")
}

// 밤 행동 단추 이름 (직업마다), 단추는 보이는 글로 찾음 (읽기 이름엔 대상 닉네임이 앞에 붙음, 예: "민수 · 동료 의사 보호")
const NIGHT_LABEL = { JOKER: "암살", DOCTOR: "보호", GUARD: "조사", WITCH_HUNTER: "확인" }
const nightButton = (items, role) => items.find((b) => shownLabel(b) === NIGHT_LABEL[role]) ?? null

test("A02-F-193 의사: 동료 의사 카드의 밤 단추 눌러짐", async () => {
  const { seats, me, partner } = pairWithMinsu("DOCTOR", "f193")
  await myNightPage(seats, me)
  const button = nightButton(await openMenu(partner.nickname), "DOCTOR")
  assert.ok(button !== null, "보호 단추 있음")
  assert.equal(button.disabled, false)
})

test("A02-F-194 경비원: 동료 경비원 카드의 밤 단추 눌러짐", async () => {
  const { seats, me, partner } = pairWithMinsu("GUARD", "f194")
  await myNightPage(seats, me)
  const button = nightButton(await openMenu(partner.nickname), "GUARD")
  assert.ok(button !== null, "조사 단추 있음")
  assert.equal(button.disabled, false)
})

test("A02-F-195 광대: 동료 광대 카드의 밤 단추 꺼짐(누를 수 있는 밤 단추 없음)", async () => {
  const { seats, me, partner } = pairWithMinsu("JOKER", "f195")
  await myNightPage(seats, me)
  await assertCanActOnCitizen(seats)
  const items = await openMenu(partner.nickname)
  const button = nightButton(items, "JOKER")
  assert.equal(button === null || button.disabled === true, true)
})

test("A02-F-196 마녀사냥꾼: 죽은 동료 마녀사냥꾼 카드의 밤 단추 눌러짐", async () => {
  const { seats, me, partner } = pairWithMinsu("WITCH_HUNTER", "f196")
  await myNightPage(seats, me, { alive: { [partner.uuid]: false } })
  const items = await openMenu(partner.nickname)
  const button = items.find((b) => !/취소/.test(b.getAttribute("aria-label") ?? "")) ?? null
  assert.ok(button !== null, `밤 단추 있음: ${items.map((b) => b.getAttribute("aria-label"))}`)
  assert.equal(button.disabled, false)
})

test("A02-F-197 광대가 동료 광대 카드 누름 → 메뉴에 밤 항목 없음", async () => {
  const { seats, me, partner } = pairWithMinsu("JOKER", "f197")
  await myNightPage(seats, me)
  await assertCanActOnCitizen(seats)
  const items = await openMenu(partner.nickname)
  assert.deepEqual(items.map((b) => shownLabel(b)).filter((l) => l === "암살" || l === "취소하기"), [])
})

test("A02-F-198 의사가 동료 의사 카드 누름 → 밤 항목 있음", async () => {
  const { seats, me, partner } = pairWithMinsu("DOCTOR", "f198")
  await myNightPage(seats, me)
  const items = await openMenu(partner.nickname)
  assert.ok(nightButton(items, "DOCTOR"), `메뉴: ${items.map((b) => b.getAttribute("aria-label"))}`)
})

test("A02-F-199 서버 답 TARGET_IS_ALLY → \"동료 광대는 고를 수 없습니다.\" 글 보임", async () => {
  const { seats, me } = pairWithMinsu("JOKER", "f199")
  // 서버가 밤 행동을 동료 지목으로 거절했다고 답함
  const ackReply = (event) => (event === "submit_night_action" ? { ok: false, code: "TARGET_IS_ALLY", message: "rejected" } : undefined)
  const { socket } = await myNightPage(seats, me, { ackReply })
  // 동료 아닌 사람을 골라 보냄 (화면은 동료 카드엔 밤 단추를 안 줌)
  const citizen = ofRole(seats, "CITIZEN")[0]
  const button = nightButton(await openMenu(citizen.nickname), "JOKER")
  assert.ok(button !== null, "암살 단추 있음")
  RTL.fireEvent.click(button)
  await waitUntil(() => socket.sent.some((s) => s.event === "submit_night_action"), { what: "밤 행동 보냄" })
  await waitUntil(() => RTL.screen.queryByText("동료 광대는 고를 수 없습니다.") !== null, { what: "거절 글 보임" })
})

test("A02-F-200 의사 밤 대상 → 동료 단추 글(화면 읽기 이름) \"민수 · 동료 의사\"", async () => {
  const { seats, me } = pairWithMinsu("DOCTOR", "f200")
  await myNightPage(seats, me)
  const named = RTL.screen.queryAllByRole("button", { name: "민수 · 동료 의사" })
    .concat(RTL.screen.queryAllByRole("menuitem", { name: "민수 · 동료 의사" }))
  assert.ok(named.length > 0, "\"민수 · 동료 의사\" 이름의 단추가 화면에 있음")
})
