// "다음 게임 설정 유지" 없앰 시험: 판 중 설정 창 방관리 탭에 스위치 없음·안내 한 줄, 판 뒤 새 방 만들기 화면은 처음 값, "방장이 새 방을 만드는 중" 기다림 화면 없음
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-058~060 (화면 부품·상태)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"
import { GameResultPage } from "./resultPage.mjs"

const { default: SettingPanel } = await import("../../src/domains/game/ingame/components/controls/ingameSetting/SettingPanel.jsx")
const { default: GameSetupPage } = await import("../../src/domains/game/setup/pages/GameSetupPage.jsx")
const { default: InGamePage } = await import("../../src/domains/game/ingame/pages/InGamePage.jsx")

test.afterEach(K.resetAll)

const KEEP_SWITCH = "다음 게임 설정 유지"

test("A08-F-058 7명 판: 방장의 방관리 탭 → \"다음 게임 설정 유지\" 스위치 없음, 다음 판 방 안내 한 줄", async () => {
  K.installFakeSocket()
  // 0번 자리가 방장, 나 = 방장
  K.liveGame({ n: 7, me: 0, roles: ["CITIZEN", "JOKER", "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN", "CITIZEN"] })
  await K.renderAt("/ingame", K.h(SettingPanel, { open: true, onClose: () => {}, timerPlacement: "top", onCycleTimerPlacement: () => {} }), { shell: false })
  const tab = K.RTL.screen.getAllByRole("button").find((b) => b.textContent.includes("방관리"))
  assert.ok(tab, "방장인데 방관리 탭이 없음")
  await K.click(tab)
  assert.equal(document.body.textContent.includes(KEEP_SWITCH), false)
  assert.equal(K.RTL.screen.queryAllByRole("checkbox").some((box) => (box.getAttribute("aria-label") ?? "").includes("유지")), false)
  assert.equal(K.RTL.screen.queryAllByRole("switch").length, 0)
  const notice = document.querySelector('[data-testid="ingame-room-tab-notice"]')
  assert.ok(notice !== null, "다음 판 방 안내가 없음")
  assert.equal(notice.textContent, "게임이 끝나면 같은 방 코드·같은 설정으로 대기방이 다시 열립니다.")
})

// 숫자 고르기 칸의 지금 숫자 (감소 단추 옆 칸), 예: "최대 플레이어 수" → 10
function stepperValue(label) {
  const down = document.querySelector(`button[aria-label="${label} 감소"]`)
  if (!down) throw new Error(`${label} 칸 없음`)
  return Number.parseInt(down.nextElementSibling?.textContent ?? "", 10)
}

test("A08-F-059 판 뒤 로비 → 게임 설정 화면 → 지난 판 설정이 아니라 처음 값(정원 10·광대 2)", async () => {
  const sock = K.installFakeSocket()
  const me = "a08a0000-0000-4000-8000-000000000591"
  K.signIn(me, "나")
  // 지난 판 방 설정(정원 7·광대 1)이 남아 있고, 옛 "다음 게임 설정 유지" 저장값도 브라우저에 남아 있음
  K.useMatchingStore.getState().setRoom({ ...K.roomOf({ uuids: [me], max: 7 }) })
  try {
    window.localStorage.setItem(`joker:next-room-settings:v1:${me}`, JSON.stringify({
      schemaVersion: 1, accountId: me, enabled: true,
      source: { maxPlayers: 7, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30 },
    }))
  } catch {
    // 저장소가 막힌 곳이면 남은 방 설정만으로 봄
  }
  await K.renderAt("/game-setup", K.h(GameSetupPage), { shell: false })
  await K.flush()
  assert.equal(stepperValue("최대 플레이어 수"), 10)
  assert.equal(stepperValue("광대(마피아) 플레이어 수"), 2)
  // 로비 입장 정리를 서버에 알림 (지난 대기방 자리 지움)
  assert.equal(sock.sentOf("enter_lobby").length, 1)
})

test("A08-F-060 6명 판: 판 끝 알림만 와도 대기방 화면 안 열림, 결과 화면 → 대기방 가는 길에 \"방장이 새 방을 만드는 중\" 기다림 글 없음", async () => {
  const sock = K.installFakeSocket()
  // 광대 2, 5번은 앞서 죽음 → 이 밤 4번 죽음 → 광대 승
  const g = K.liveGame({ n: 6, me: 2, roles: ["JOKER", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN", "CITIZEN"], dead: [5], phase: "NIGHT", dayIndex: 1 })
  sock.answer("get_current_room", { ok: true, room: null })
  K.installDialogs()
  const view = await K.renderAt("/ingame", K.h(InGamePage), { extra: { "/gameresult": K.h(GameResultPage) } })
  g.seats[4].alive = false
  const endPayload = {
    gameId: g.gameId, phase: "ENDED", dayIndex: 1,
    players: g.seats.map((s) => ({ uuid: s.uuid, isAlive: s.alive })),
    victimUuid: g.seats[4].uuid, deathReveals: [{ victimUuid: g.seats[4].uuid, source: "JOKER" }], doctorSaved: false,
    winResult: K.winResultOf(g.seats, "JOKER", 1),
    resultClosesAt: Date.now() + 180_000,
  }
  sock.answer("get_session_snapshot", () => K.endedSnapshotOf({ gameId: g.gameId, seats: g.seats, me: 2, winner: "JOKER", dayIndex: 1, resultClosesAt: endPayload.resultClosesAt }))
  await sock.serverSays("night_result_applied", endPayload)
  // 옛 서버 알림(방장이 새 방을 만들었다)이 와도 대기방으로 끌려가지 않음
  await sock.serverSays("party_matching_room_ready", { gameId: g.gameId, room: K.roomOf({ uuids: [g.meUuid] }) })
  // 낮 시작 연출(살해 글)을 닫으면 결과 화면으로 (영상을 못 그리는 곳에선 글 창 "확인")
  assert.equal(view.path(), "/ingame")
  await K.waitUntil(() => K.button("확인") !== null, { label: "낮 시작 연출 글 창" })
  await K.click(K.button("확인"))
  await K.waitUntil(() => view.path() === "/gameresult", { label: "결과 화면 이동" })
  assert.deepEqual(view.navigations, ["/gameresult"])
  await K.finishIntro()
  await K.flush()
  assert.equal(document.body.textContent.includes("새 방을 만드는 중"), false)

  // "대기방으로" 누르고 답 기다리는 동안에도 기다림 글 없음 → 답이 오면 바로 대기방
  sock.answer("return_to_room", K.HOLD)
  await K.click(K.button("대기방으로"))
  assert.equal(document.body.textContent.includes("새 방을 만드는 중"), false)
  assert.equal(document.body.textContent.includes("방장을 기다리"), false)
  await sock.release("return_to_room", { ok: true, room: K.roomOf({ uuids: [g.meUuid], hostUuid: null, reservedHostUuid: g.seats[0].uuid }) })
  await K.flush()
  assert.deepEqual(view.navigations, ["/gameresult", "/game-matching"])
})
