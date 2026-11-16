// 밤 동안 연출 없음 시험(화면 전체): 밤엔 누구 화면에도 암살 영상·"진행을 기다리는 중" 창이 없고, 없어진 옛 사건(night_action_success·night_presentation_wait)이 와도 아무것도 안 뜸, 밤 중 새로고침도 같음
// 목록 시험목록/A05b-밤-알림-낮연출.md A05-F-633~650, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-dawn/night-no-presentation.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as kit from "./dawnKit.mjs"

test.afterEach(kit.resetAll)

const WAIT_TEXT = "진행을 기다리는 중입니다."
const PENDING_ASSET_TEXT = "연출 자료 대기 중입니다."

// 8명 판 자리: 0 광대, 1 의사, 2 A(시민), 3 시민, 4 죽은 관전자, 5 경비원
const ROLES8 = { 0: "JOKER", 1: "DOCTOR", 5: "GUARD" }
const A = 2

// 밤 동안 연출 흔적이 하나도 없는지
const quietNight = () =>
  kit.dawnVideo() === null && !kit.bodyText().includes(WAIT_TEXT) && !kit.bodyText().includes(PENDING_ASSET_TEXT)

// 차례를 차례대로 열고 닫음 (끝낼 직업까지)
async function runTurns(g, untilRole) {
  for (const role of ["JOKER", "DOCTOR", "GUARD"]) {
    await g.turnStarts(role)
    await g.turnEnds(role)
    if (role === untilRole) return
  }
}

const VIEWERS = [["광대", 0], ["당한 A", A], ["의사", 1], ["시민", 3], ["죽은 관전자", 4]]
const POINTS = [["광대 차례 끝", "JOKER"], ["경비원 차례 끝", "GUARD"]]
let no = 633
for (const [pointName, untilRole] of POINTS) {
  for (const [viewerName, me] of VIEWERS) {
    test(`A05-F-${no} [버그 5] 8명 ${viewerName} 화면 · ${pointName} → 암살 영상·"${WAIT_TEXT}" 없음`, async () => {
      const g = await kit.openGame({ n: 8, me, roles: ROLES8, dead: [4] })
      await g.page()
      await runTurns(g, untilRole)
      assert.equal(g.state().phase, "NIGHT", "밤이 아님 (준비 잘못)")
      assert.ok(quietNight(), "밤에 연출 흔적이 보임")
    })
    no += 1
  }
}

// 없어진 옛 성공 사건 (당한 사람 시점) — 화면이 안 받음
const OLD_SUCCESS = ["KILL", "HEAL", "INVESTIGATE", "CONFIRM"]
OLD_SUCCESS.forEach((type, i) => {
  test(`A05-F-${643 + i} 옛 night_action_success ${type}(당한 사람 시점)을 소켓에 넣음 → 영상·"${PENDING_ASSET_TEXT}" 없음`, async () => {
    const g = await kit.openGame({ n: 8, me: A, roles: ROLES8, dead: [4], dayIndex: 2 })
    await g.page()
    await g.turnStarts("JOKER")
    await g.say("night_action_success", {
      gameId: g.gameId, dayIndex: 2, type, actionType: type, perspective: "TARGET", perspectives: ["TARGET"],
      targetUuid: g.uuid(A), eventId: `old-${type}`,
    })
    assert.ok(quietNight(), "옛 사건으로 연출이 뜸")
  })
})

test("A05-F-647 옛 night_presentation_wait { waiting: true } → 기다림 창 없음, 카드 누르기 됨", async () => {
  const g = await kit.openGame({ n: 8, me: 0, roles: ROLES8, dead: [4] })
  await g.page()
  await g.turnStarts("JOKER")
  await g.say("night_presentation_wait", { gameId: g.gameId, dayIndex: 1, waiting: true })
  assert.ok(quietNight(), "기다림 창이 뜸")
  assert.equal(kit.cardOf(g.nick(3)).closest("[inert]"), null, "카드가 막힌 판 안에 있음")
  const items = await kit.openMenu(g.nick(3))
  assert.equal(items.some((item) => item.name === kit.NIGHT_ACTION_LABELS.JOKER && item.enabled), true)
})

// 밤 중(광대 차례 끝 뒤) 새로고침 (7명: 0 광대, 1 의사, 2 A)
const RELOAD_VIEWERS = [["광대", 0], ["당한 A", A], ["시민", 3]]
RELOAD_VIEWERS.forEach(([name, me], i) => {
  test(`A05-F-${648 + i} 7명 광대 차례 끝 뒤 ${name} 새로고침 → 영상·기다림 창 없음, A 카드 산 사람`, async () => {
    const g = await kit.openGame({ n: 7, me, roles: { 0: "JOKER", 1: "DOCTOR" } })
    await g.page()
    await g.turnStarts("JOKER")
    await g.turnEnds("JOKER")
    await g.reload({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR", nightTurnDeadline: Date.now() + 30_000 })
    assert.equal(g.state()?.nightTurnRole, "DOCTOR", "스냅샷이 안 들어감 (준비 잘못)")
    assert.ok(quietNight(), "새로고침 뒤 연출 흔적이 보임")
    assert.equal(kit.cardInfo(g.nick(A))?.getAttribute("data-ingame-player-status"), "alive")
  })
})
