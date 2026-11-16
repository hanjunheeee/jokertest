// 밤 화면 시험(화면 부품): 차례 시작 알림을 받으면 "○○의 시간입니다" 안내 창이 뜨는지, 구성에 없는 직업 안내는 안 뜨는지
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-131~134·168·169, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/turn-announce.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")
const { createElement } = await import("react")
const { useInGameNightTurnAnnouncement } = await import("../../src/domains/game/ingame/hooks/useInGameNightTurnAnnouncement.js")
const { default: InGameNightTurnAnnouncementOverlay } = await import("../../src/domains/game/ingame/components/nightTurn/InGameNightTurnAnnouncementOverlay.jsx")

test.afterEach(() => kit.reset())

// 인게임 화면처럼 차례 안내 훅 값으로 안내 창을 그림
function Announcement() {
  const turn = useInGameNightTurnAnnouncement()
  return createElement(InGameNightTurnAnnouncementOverlay, { open: turn.open, announcement: turn.announcement, onClose: turn.close })
}

// 지금 떠 있는 창들의 글
const dialogTexts = () => kit.screen.queryAllByRole("dialog").map((dialog) => dialog.textContent)

for (const [no, role, message] of [
  ["A05-F-131", "JOKER", "광대의 시간입니다"],
  ["A05-F-132", "DOCTOR", "의사의 시간입니다"],
  ["A05-F-133", "GUARD", "경비원의 시간입니다"],
  ["A05-F-134", "WITCH_HUNTER", "마녀사냥꾼의 시간입니다"],
]) {
  test(`${no} 10명 시민 화면 ${role} 차례 시작 → 창 글 "${message}", "확인" 단추`, () => {
    const t = kit.openNight({ n: 10, me: 0, role: "CITIZEN", dayIndex: role === "WITCH_HUNTER" ? 2 : 1, loggedIn: true })
    kit.render(createElement(Announcement))
    t.turnStarts(role)
    const dialog = kit.screen.getByRole("dialog")
    assert.match(dialog.textContent, new RegExp(message))
    assert.ok(kit.within(dialog).getByRole("button", { name: "확인" }))
  })
}

test("A05-F-168 6명 시민 화면: 다 죽은 직업(의사) 차례 시작에도 \"의사의 시간입니다\" 창이 뜸", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN", dead: [2], loggedIn: true })
  kit.render(createElement(Announcement))
  t.turnStarts("DOCTOR")
  assert.match(kit.screen.getByRole("dialog").textContent, /의사의 시간입니다/)
})

test("A05-F-169 5명 판(광대1·시민4) 시민 화면: 광대 차례 뒤 바로 밤 결과 → 의사·경비원·마녀사냥꾼 창 0", () => {
  const t = kit.openNight({ n: 5, me: 0, role: "CITIZEN", loggedIn: true })
  kit.render(createElement(Announcement))
  const seen = []
  t.turnStarts("JOKER")
  seen.push(...dialogTexts())
  t.turnEnds("JOKER")
  seen.push(...dialogTexts())
  t.actionsResolved()
  seen.push(...dialogTexts())
  t.nightApplied({ victim: 3 })
  seen.push(...dialogTexts())
  assert.ok(seen.some((text) => /광대의 시간입니다/.test(text)), "광대 안내가 안 뜸 (준비 잘못)")
  assert.equal(seen.filter((text) => /의사의 시간|경비원의 시간|마녀사냥꾼의 시간/.test(text)).length, 0)
})
