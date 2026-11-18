// 낮 시작 연출 창 부품 시험: 죽음이면 암살 영상 + 글, 아무도 안 죽었으면 "아무 일 없음" 글 창, 없음·닫힘이면 안 그림, 영상 오류면 글 창, 글에 직업 이름 없음
// 목록 시험목록/A05b-밤-알림-낮연출.md A05-F-578~586, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-dawn/dawn-report-view.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as kit from "./dawnKit.mjs"

test.afterEach(kit.resetAll)

const { React, RTL } = kit
const { default: InGameDawnReport } = await import("../../src/domains/game/ingame/components/dawnReport/InGameDawnReport.jsx")
const { buildDawnReport } = await import("../../src/domains/game/ingame/utils/dawnReport.js")
const { SFX_MANIFEST } = await import("../../src/shared/audio/sfxManifest.js")

// 6명 명단, A = 0번
const PLAYERS = kit.NAMES.slice(0, 6).map((nickname, i) => ({ uuid: `v${i}`, nickname }))
const A = PLAYERS[0]
const killed = () => buildDawnReport({ gameId: "g1", nightDayIndex: 1, deathReveals: [{ victimUuid: A.uuid, source: "JOKER" }], players: PLAYERS })
// 아무도 안 죽은 밤 (의사가 살렸든 광대가 안 죽였든 같은 값)
const quiet = () => buildDawnReport({ gameId: "g1", nightDayIndex: 1, deathReveals: [], players: PLAYERS })

// 인게임 화면처럼: 다 보면(onFinish) 닫힘, 연출 값이 바뀌면 key로 새로 그림
function Host({ report, open = true }) {
  const [shown, setShown] = React.useState(open)
  return React.createElement(InGameDawnReport, { key: report?.key ?? "none", report, open: shown, onFinish: () => setShown(false) })
}
async function show(report, open = true) {
  let view
  await RTL.act(async () => { view = RTL.render(React.createElement(Host, { report, open })) })
  await kit.flush()
  return view
}

test("A05-F-578 죽음 연출 → 암살 영상 칸 있음, 영상 위 글 \"지난밤 A님이 살해당했습니다\"", async () => {
  await show(killed())
  assert.ok(kit.dawnVideo(), "암살 영상 칸이 없음")
  assert.equal(kit.dawnVideoMessage(), kit.killedText(A.nickname))
})

test("A05-F-579 죽음 연출 영상 → 주소가 지금 있는 암살(KILL) 영상 목록 안", async () => {
  await show(killed())
  const src = kit.sourceVideo()?.getAttribute("src")
  const killVideos = Object.entries(SFX_MANIFEST["night-success-video"].embeddedVideos)
    .filter(([key]) => key.startsWith("KILL-"))
    .map(([, value]) => value)
  assert.equal(typeof src, "string")
  assert.ok(killVideos.includes(src), `KILL 영상이 아님: ${src}`)
})

test("A05-F-580 [지금 동작] 영상이 오류로 끝남 → [data-ingame-dawn-report=KILLED] 글 창, 같은 글", async () => {
  await show(killed())
  const video = kit.sourceVideo()
  assert.ok(video, "영상이 없음 (준비 잘못)")
  await RTL.act(async () => { RTL.fireEvent(video, new window.Event("error")) })
  await kit.flush()
  const dialog = kit.dawnDialog("KILLED")
  assert.ok(dialog, "글 창으로 안 바뀜")
  assert.match(dialog.textContent, new RegExp(kit.killedText(A.nickname)))
})

test("A05-F-581 아무 일 없음 연출 → [data-ingame-dawn-report=QUIET] 창에 아무 일 없음 글, 영상 요소 없음", async () => {
  await show(quiet())
  const dialog = kit.dawnDialog("QUIET")
  assert.ok(dialog, "아무 일 글 창이 없음")
  assert.match(dialog.textContent, new RegExp(kit.QUIET_TEXT))
  assert.equal(kit.dawnVideo(), null)
  assert.equal(document.querySelector("video"), null)
})

test("A05-F-582 연출 없음(null) → 영상·글 창 둘 다 없음", async () => {
  await show(null)
  assert.equal(kit.dawnVideo(), null)
  assert.equal(kit.dawnDialog(), null)
})

test("A05-F-583 닫힌 상태(open 거짓) → 아무것도 없음", async () => {
  const view = await show(killed(), false)
  assert.equal(view.container.innerHTML, "")
  assert.equal(kit.dawnVideo(), null)
  assert.equal(kit.dawnDialog(), null)
})

test("A05-F-584 아무 일 창 \"확인\" 누름 → 창 없어짐", async () => {
  await show(quiet())
  assert.ok(kit.dawnDialog("QUIET"), "아무 일 창이 없음 (준비 잘못)")
  await kit.confirmIn(kit.dawnDialog("QUIET"))
  await kit.waitUntil(() => kit.dawnDialog() === null, { what: "아무 일 창 닫힘" })
  assert.equal(kit.dawnDialog(), null)
})

// 보는 사람이 직업을 아는 사람이 죽어도 글엔 직업 이름 없음 (판 값 → 스토어 연출 값 → 창)
function StoreDawn() {
  const report = kit.useInGameStore(kit.selectDawnReport)
  return React.createElement(InGameDawnReport, { key: report?.key ?? "none", report, open: true, onFinish: () => {} })
}
const dawnAllText = () => `${kit.dawnVideoMessage() ?? ""}${kit.dawnDialog()?.textContent ?? ""}`

test("A05-F-585 보는 사람 의사, 당한 사람 = 같은 직업 동료 의사 → 글에 \"의사\" 없음", async () => {
  // 10명 판 의사 둘(3·4), 나는 3번 의사, 4번 동료가 당함
  const g = await kit.openGame({ n: 10, me: 3, roles: { 0: "JOKER", 1: "JOKER", 3: "DOCTOR", 4: "DOCTOR" } })
  assert.deepEqual(g.state().self.allies, [g.uuid(4)], "동료가 안 보임 (준비 잘못)")
  await g.mountElement(React.createElement(StoreDawn))
  await g.nightResult({ victim: 4 })
  assert.match(dawnAllText(), new RegExp(kit.killedText(g.nick(4))))
  assert.doesNotMatch(dawnAllText(), /의사/)
})

test("A05-F-586 보는 사람 경비원, 당한 사람 = 전날 조사한 시민 → 글에 직업 이름 없음", async () => {
  // 7명 판, 나는 5번 경비원, 1밤에 3번을 조사(시민) → 2밤에 3번이 당함
  const g = await kit.openGame({ n: 7, me: 5, roles: { 0: "JOKER", 1: "DOCTOR", 5: "GUARD" } })
  await g.mountElement(React.createElement(StoreDawn))
  await g.turnStarts("GUARD")
  await g.turnEnds("GUARD")
  await g.privateResult({ actionType: "INVESTIGATE", targetId: g.uuid(3), role: "CITIZEN" })
  await g.nightResult({ victim: null })
  await g.dayToNight()
  await g.nightResult({ victim: 3 })
  assert.match(dawnAllText(), new RegExp(kit.killedText(g.nick(3))))
  assert.doesNotMatch(dawnAllText(), kit.ROLE_WORDS)
})
