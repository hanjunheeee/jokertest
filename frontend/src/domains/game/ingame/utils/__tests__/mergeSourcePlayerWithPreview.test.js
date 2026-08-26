import test from "node:test"
import assert from "node:assert/strict"
import { mergeSourcePlayerWithPreview } from "../mergeSourcePlayerWithPreview.js"
import { INGAME_PLAYER_STATUS } from "../../constants/board/status/ingamePlayerStatus.js"
import { INGAME_PLAYER_THEME_PALETTE } from "../../constants/ingamePlayerTheme.js"

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

test("colorIndex가 있으면 theme이 그 팔레트 색이 되고 themeIndex도 같은 값이다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, colorIndex: 6 },
    preview(),
  )
  assert.equal(result.theme.color, INGAME_PLAYER_THEME_PALETTE[6].color)
  assert.equal(result.theme.styles.color, INGAME_PLAYER_THEME_PALETTE[6].color)
  assert.equal(result.themeIndex, 6)
})

test("colorIndex가 없으면 theme·themeIndex가 null이다(기존 기본색 fallback)", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true },
    preview(),
  )
  assert.equal(result.theme, null)
  assert.equal(result.themeIndex, null)
})

test("colorIndex 형태가 어긋나면(-1·문자열·소수·null) theme이 null이고 throw하지 않는다", () => {
  for (const badColorIndex of [-1, "3", 1.5, null, NaN]) {
    const result = mergeSourcePlayerWithPreview(
      { id: "u3", name: "C", connected: true, alive: true, colorIndex: badColorIndex },
      preview(),
    )
    assert.equal(result.theme, null)
    assert.equal(result.themeIndex, null)
  }
})

test("서버 참가자는 preview의 themeIndex/theme을 절대 물려받지 않는다", () => {
  const withColor = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, colorIndex: 4 },
    preview(),
  )
  // preview는 themeIndex 0 / theme {}이지만 결과는 colorIndex 4를 따른다.
  assert.equal(withColor.themeIndex, 4)
  assert.notDeepEqual(withColor.theme, {})

  const withoutColor = mergeSourcePlayerWithPreview(
    { id: "u2", name: "B", connected: true, alive: true },
    preview(),
  )
  assert.equal(withoutColor.themeIndex, null)
  assert.equal(withoutColor.theme, null)
})

test("theme이 바뀌어도 preview에서 오는 초상·프레임은 그대로 남는다", () => {
  const result = mergeSourcePlayerWithPreview(
    { id: "u1", name: "A", connected: true, alive: true, colorIndex: 1 },
    preview(),
  )
  assert.equal(result.portraitSrc, "p.png")
  assert.equal(result.frameSrc, "f.png")
})
