// 카드 이름판 띠 시험: 이름 색 10가지가 띠 위에서 대비 4.5 이상(셈) + 판 화면 카드 이름이 띠 칸 안에 그려짐 (화면 부품)
// 목록 A02-F-201~214 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md), 결정 2026-11-16 낮 "카드 이름판에만 어두운 띠"
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { RTL, dismissOverlays, installSocket, loginAs, renderInGamePage, resetAll, useInGameStore } from "./a02Render.mjs"
import { buildGameStarted, nextGameId, seatCode } from "./a02Fixtures.mjs"

const { createElement: h } = await import("react")

const { INGAME_PLAYER_THEME_PALETTE } = await import("../../src/shared/constants/ingamePlayerTheme.js")
const {
  NAMEPLATE_BANDS, NAMEPLATE_DEFAULT_TEXT_COLOR, pickNameplateBand, worstBandContrast,
} = await import("../../src/domains/game/ingame/utils/nameplateBand.js")
const { default: InGamePlayerCard } = await import("../../src/domains/game/ingame/components/board/InGamePlayerCard.jsx")
const { resolveInGamePlayerTheme } = await import("../../src/shared/constants/ingamePlayerTheme.js")
const { INGAME_PLAYER_STATUS } = await import("../../src/domains/game/shared/constants/ingamePlayerStatus.js")

test.afterEach(() => {
  resetAll()
  mock.timers.reset()
})

// 글자 대비 기준 (WCAG 보통 글)
const MIN_CONTRAST = 4.5

// 팔레트 색마다: 고른 띠 위 가장 나쁜 대비 (뒤 그림이 흰색·검정 어느 쪽이어도)
INGAME_PLAYER_THEME_PALETTE.forEach((entry, index) => {
  test(`A02-F-${201 + index} 이름 색 ${index}번(${entry.color}) → 고른 띠 위 대비 4.5 이상`, () => {
    const kind = pickNameplateBand(entry.color)
    const contrast = worstBandContrast(entry.color, NAMEPLATE_BANDS[kind])
    assert.ok(contrast >= MIN_CONTRAST, `${entry.color} ${kind} 띠 ${contrast.toFixed(2)}`)
  })
})

test("A02-F-211 색 없는 카드 기본 글자색 → 고른 띠 위 대비 4.5 이상", () => {
  const kind = pickNameplateBand(NAMEPLATE_DEFAULT_TEXT_COLOR)
  assert.ok(worstBandContrast(NAMEPLATE_DEFAULT_TEXT_COLOR, NAMEPLATE_BANDS[kind]) >= MIN_CONTRAST)
})

// 띠 칸 (카드 안 이름 글)
const bandsIn = (root) => [...root.querySelectorAll("[data-ingame-nameplate-band]")]

test("A02-F-212 10명 판 화면 → 카드 10장 모두 이름 글이 띠 칸 안에, 띠는 그 사람 색에 맞는 쪽", async () => {
  const seats = seatCode("J2D2G2W2C2", { gameTag: "band" })
  const me = seats[0]
  installSocket()
  loginAs(me)
  RTL.act(() => { useInGameStore.getState().setGamePayload(buildGameStarted(seats, me, { gameId: nextGameId("band") })) })
  renderInGamePage()
  await dismissOverlays()
  const bands = bandsIn(document.body)
  const names = bands.map((el) => el.textContent)
  for (const seat of seats) assert.ok(names.includes(seat.nickname), `${seat.nickname} 띠 칸 안에 없음`)
  seats.forEach((seat, i) => {
    const band = bands.find((el) => el.textContent === seat.nickname)
    assert.equal(band.getAttribute("data-ingame-nameplate-band"), pickNameplateBand(INGAME_PLAYER_THEME_PALETTE[i].color), seat.nickname)
  })
})

test("A02-F-213 짙은 남색 카드(9번) → 밝은 띠, 흰 카드(0번) → 어두운 띠", () => {
  const { container: navy } = RTL.render(card({ nickname: "주원", theme: resolveInGamePlayerTheme(9) }))
  assert.equal(bandsIn(navy)[0].getAttribute("data-ingame-nameplate-band"), "light")
  const { container: white } = RTL.render(card({ nickname: "민수", theme: resolveInGamePlayerTheme(0) }))
  assert.equal(bandsIn(white)[0].getAttribute("data-ingame-nameplate-band"), "dark")
})

test("A02-F-214 죽은 사람 카드·8자 닉네임·동료 표시 → 이름은 이름판 안 띠 칸 하나, 띠는 이름판 폭 안에서 잘림", () => {
  const nickname = "가나다라마바사아"
  const { container } = RTL.render(card({
    nickname, theme: resolveInGamePlayerTheme(4), status: INGAME_PLAYER_STATUS.DEAD, allyLabel: "동료 의사",
  }))
  const bands = bandsIn(container)
  assert.equal(bands.length, 1)
  assert.equal(bands[0].textContent, nickname)
  // 이름판 칸(p) 안에 있고, 칸 폭을 못 넘게 줄임표로 잘림
  assert.equal(bands[0].parentElement.tagName, "P")
  assert.match(bands[0].className, /\bmax-w-full\b/)
  assert.match(bands[0].className, /\btruncate\b/)
  assert.ok(container.querySelector("[data-ingame-ally-badge]"), "동료 표시 그대로")
})

// 카드 한 장 그리기 (판 화면 없이)
function card(props) {
  return h(InGamePlayerCard, { portraitSrc: null, ...props })
}
