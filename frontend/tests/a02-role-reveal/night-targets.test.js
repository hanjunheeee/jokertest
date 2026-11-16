// 밤 대상·카드 메뉴의 동료 시험: 내 밤 차례 스냅샷을 넣고 조작 값의 밤 대상 이름·고를 수 있음·카드 메뉴 항목·거절 글 봄 (화면 상태)
// 목록 A02-F-096~107 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md)
import test from "node:test"
import assert from "node:assert/strict"
import { RTL, installSocket, loginAs, renderActionContext, resetAll, useInGameStore } from "./a02Render.mjs"
import { buildGameStarted, buildSnapshot, nextGameId, ofRole, seatCode } from "./a02Fixtures.mjs"

const { buildInGamePlayerCardMenuItems, INGAME_CARD_MENU_ITEM_KINDS: KINDS } = await import(
  "../../src/domains/game/ingame/hooks/useInGamePlayerCardMenu.js"
)
const { computeNightActionSubmitPatch } = await import("../../src/domains/game/ingame/utils/nightPatches.js")

test.afterEach(() => resetAll())

// 직업마다 2명 판 (6명), 상대 닉네임은 "민수"로 맞춤
const PAIR_CODES = { JOKER: "J2C4", DOCTOR: "J1D2C3", GUARD: "J1G2C3", WITCH_HUNTER: "J1W2C3" }
function pairWithMinsu(role, tag) {
  const seats = seatCode(PAIR_CODES[role], { gameTag: tag })
  const [me, partner] = ofRole(seats, role)
  const holder = seats.find((p) => p.nickname === "민수")
  if (holder && holder !== partner) holder.nickname = partner.nickname
  partner.nickname = "민수"
  return { seats, me, partner }
}

// 내 직업 밤 차례로 넣고 조작 값 그림 (마녀사냥꾼은 둘째 밤부터라 2일째)
function myNightTurn(seats, me, { alive = {} } = {}) {
  installSocket()
  loginAs(me)
  const gameId = nextGameId("night")
  const dayIndex = me.role === "WITCH_HUNTER" ? 2 : 1
  useInGameStore.getState().setGamePayload(buildGameStarted(seats, me, { gameId }))
  RTL.act(() => {
    useInGameStore.getState().applySessionSnapshot(buildSnapshot(seats, me, {
      gameId, phase: "NIGHT", dayIndex, alive,
      extra: { nightTurnRole: me.role, nightTurnDeadline: Date.now() + 30_000 },
    }))
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  const sink = renderActionContext()
  return sink
}

const targetOf = (sink, uuid) => sink.ctx.nightActionTargets.find((t) => t.id === uuid)

// A02-F-096~099 동료 대상 이름 뒤 "동료 직업"
const NAME_CASES = [
  ["A02-F-096", "JOKER", "민수 · 동료 광대"],
  ["A02-F-097", "DOCTOR", "민수 · 동료 의사"],
  ["A02-F-098", "GUARD", "민수 · 동료 경비원"],
  ["A02-F-099", "WITCH_HUNTER", "민수 · 동료 마녀사냥꾼"],
]
for (const [no, role, name] of NAME_CASES) {
  test(`${no} ${role} 밤 대상, 동료 "민수" → 이름 "${name}"`, () => {
    const { seats, me, partner } = pairWithMinsu(role, no)
    const sink = myNightTurn(seats, me)
    assert.equal(targetOf(sink, partner.uuid).name, name)
  })
}

test("A02-F-100 광대, 산 동료 광대 → 고를 수 없음", () => {
  const { seats, me, partner } = pairWithMinsu("JOKER", "f100")
  const sink = myNightTurn(seats, me)
  assert.equal(targetOf(sink, partner.uuid).selectable, false)
})

test("A02-F-101 의사, 산 동료 의사 → 고를 수 있음", () => {
  const { seats, me, partner } = pairWithMinsu("DOCTOR", "f101")
  const sink = myNightTurn(seats, me)
  assert.equal(targetOf(sink, partner.uuid).selectable, true)
})

test("A02-F-102 경비원, 산 동료 경비원 → 고를 수 있음", () => {
  const { seats, me, partner } = pairWithMinsu("GUARD", "f102")
  const sink = myNightTurn(seats, me)
  assert.equal(targetOf(sink, partner.uuid).selectable, true)
})

test("A02-F-103 마녀사냥꾼, 산 동료 마녀사냥꾼 → 못 고름", () => {
  const { seats, me, partner } = pairWithMinsu("WITCH_HUNTER", "f103")
  const sink = myNightTurn(seats, me)
  assert.equal(targetOf(sink, partner.uuid).selectable, false)
})

test("A02-F-104 마녀사냥꾼, 죽은 동료 마녀사냥꾼 → 고를 수 있음", () => {
  const { seats, me, partner } = pairWithMinsu("WITCH_HUNTER", "f104")
  const sink = myNightTurn(seats, me, { alive: { [partner.uuid]: false } })
  assert.equal(targetOf(sink, partner.uuid).alive, false)
  assert.equal(targetOf(sink, partner.uuid).selectable, true)
})

// 카드 메뉴 항목 (지금 조작 값으로 상대 카드 메뉴 만들기)
const menuOf = (sink, targetUuid, me) => buildInGamePlayerCardMenuItems(sink.ctx, targetUuid, me.uuid)
const nightKinds = (items) => items.filter((i) => i.kind === KINDS.NIGHT_ACTION || i.kind === KINDS.NIGHT_ACTION_CANCEL)

test("A02-F-105 광대가 동료 광대 카드 메뉴 → 밤 항목 없음", () => {
  const { seats, me, partner } = pairWithMinsu("JOKER", "f105")
  const sink = myNightTurn(seats, me)
  assert.deepEqual(nightKinds(menuOf(sink, partner.uuid, me)), [])
})

test("A02-F-106 의사가 동료 의사 카드 메뉴 → 밤 항목 있음", () => {
  const { seats, me, partner } = pairWithMinsu("DOCTOR", "f106")
  const sink = myNightTurn(seats, me)
  const night = nightKinds(menuOf(sink, partner.uuid, me))
  assert.equal(night.length, 1)
  assert.equal(night[0].kind, KINDS.NIGHT_ACTION)
  assert.equal(night[0].enabled, true)
})

test("A02-F-107 서버가 동료 지목 거절(TARGET_IS_ALLY) → 글 \"동료 광대는 고를 수 없습니다.\"", () => {
  const patch = computeNightActionSubmitPatch({ ok: false, code: "TARGET_IS_ALLY", message: "server default" })
  assert.equal(patch.error, "동료 광대는 고를 수 없습니다.")
})
