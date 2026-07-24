import test from "node:test"
import assert from "node:assert/strict"
import { mergeSourcePlayerWithPreview } from "../mergeSourcePlayerWithPreview.js"
import { INGAME_PLAYER_STATUS } from "../../constants/board/status/ingamePlayerStatus.js"

function preview() {
  return { id: "player-slot-1", nickname: "플레이어 1", portraitSrc: "p.png", frameSrc: "f.png", themeIndex: 0, theme: {} }
}

test("입력 player에 role이 있으면 출력에 같은 값의 role이 있다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, role: "JOKER" },
    preview(),
  )
  assert.equal(result.role, "JOKER")
})

test("입력 player에 role 키 자체가 없으면 출력에도 role 키가 없다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true },
    preview(),
  )
  assert.equal(Object.hasOwn(result, "role"), false)
})

test("team도 동일하게 있으면 복사되고 없으면 키 자체가 생기지 않는다", () => {
  const withTeam = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, team: "MAFIA" },
    preview(),
  )
  assert.equal(withTeam.team, "MAFIA")

  const withoutTeam = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true },
    preview(),
  )
  assert.equal(Object.hasOwn(withoutTeam, "team"), false)
})

test("isAlly:true인 입력은 출력에도 isAlly:true가 있다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, isAlly: true },
    preview(),
  )
  assert.equal(result.isAlly, true)
})

test("입력 player에 isAlly 키 자체가 없으면 출력에도 isAlly 키가 없다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true },
    preview(),
  )
  assert.equal(Object.hasOwn(result, "isAlly"), false)
})

test("connected:false는 DISCONNECTED로 계산된다", () => {
  const result = mergeSourcePlayerWithPreview({ id: "u1", name: "A", connected: false, alive: true }, preview())
  assert.equal(result.status, INGAME_PLAYER_STATUS.DISCONNECTED)
})

test("connected:true, alive:true는 ALIVE로 계산된다", () => {
  const result = mergeSourcePlayerWithPreview({ id: "u1", name: "A", connected: true, alive: true }, preview())
  assert.equal(result.status, INGAME_PLAYER_STATUS.ALIVE)
})

test("connected:true, alive:false는 DEAD로 계산된다", () => {
  const result = mergeSourcePlayerWithPreview({ id: "u1", name: "A", connected: true, alive: false }, preview())
  assert.equal(result.status, INGAME_PLAYER_STATUS.DEAD)
})
