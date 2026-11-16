// 새로고침 스냅샷(get_session_snapshot 답)으로 낮 판정·내 표·마감·준비가 다시 그려지는지 화면 상태 시험
// 목록 A03-낮투표.md 번호 A03-F-077~088, 242 (⑤는 정한 글 없어 지금 동작을 임시 정답으로 씀), 밤 스냅샷의 판정 칸은 C-006과 닿음
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import {
  T0, NAMES, abstainButton, buttonByName, click, loginOnly, fakeSocket, readCardMenu, renderPage, resetAll,
  selectInGameTimebarPhaseDeadline, snapshot, useInGameStore, uuidOf,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

// 새로고침: 판 값 없이 화면을 열고, 서버가 스냅샷으로 답함 (6명 판, 나는 0번)
async function refreshWith(response) {
  loginOnly()
  const socket = fakeSocket({ acks: { get_session_snapshot: response } })
  await renderPage(socket)
  return { socket, state: useInGameStore.getState().state }
}

// 판정 칸 (서버 스냅샷 모양: 누가 누굴 찍었는지 없이 수만)
const resolution = (outcome, { alive = 6, abstain = 0, target = null } = {}) =>
  ({ round: 1, outcome, tribunalTargetUuid: target, publicVoteCount: alive, publicAbstainCount: abstain, revoteExcludedUuids: [] })

test("A03-F-077 ① 재판 스냅샷의 dayVoteResolution TRIBUNAL 받음", async () => {
  const { state } = await refreshWith(snapshot({
    phase: "TRIBUNAL",
    extra: { tribunalDeadline: Date.now() + 50_000, dayVoteResolution: resolution("TRIBUNAL", { abstain: 1, target: uuidOf(2) }), tribunal: { defendantUuid: uuidOf(2), resolved: false } },
  }))
  assert.equal(state?.dayVoteResolution?.outcome, "TRIBUNAL")
  assert.equal(state?.dayVoteResolution?.tribunalTargetUuid, uuidOf(2))
})

// A03-F-078~080, 242 밤으로 간 판정 뒤 새로고침 (C-006: 서버가 밤 스냅샷에도 이 칸을 실음, 화면이 받는지)
;[
  ["A03-F-078", "②", "TIE", { abstain: 0 }],
  ["A03-F-079", "③", "ABSTAIN_MAJORITY", { abstain: 5 }],
  ["A03-F-080", "④", "ABSTAINED", { abstain: 6 }],
  ["A03-F-242", "⑬", "DEFENDANT_DISCONNECTED", { abstain: 1 }],
].forEach(([id, mark, outcome, counts]) => {
  test(`${id} ${mark} 판정 뒤 밤 스냅샷의 dayVoteResolution ${outcome} 받음 (C-006)`, async () => {
    const { state } = await refreshWith(snapshot({
      phase: "NIGHT",
      extra: { dayVoteResolution: resolution(outcome, counts) },
    }))
    assert.equal(state?.phase, "NIGHT")
    assert.equal(state?.dayVoteResolution?.outcome, outcome)
  })
})

test("A03-F-081 ⑤ 모르는 판정 결과 이름 → 그 판정 안 받음 [지금 동작]", async () => {
  const { state } = await refreshWith(snapshot({
    phase: "TRIBUNAL",
    extra: { dayVoteResolution: resolution("REVOTE", { abstain: 1 }), tribunal: { defendantUuid: uuidOf(2), resolved: false } },
  }))
  assert.equal(state?.dayVoteResolution ?? null, null)
})

test("A03-F-082 ⑥ 당긴 dayPhaseDeadline 스냅샷 → 남은 시간 짧음(그 값)", async () => {
  const pulled = Date.now() + 3_000
  const { state } = await refreshWith(snapshot({ extra: { dayPhaseDeadline: pulled } }))
  assert.equal(selectInGameTimebarPhaseDeadline(state), pulled)
  assert.ok(pulled - Date.now() <= 3_000)
})

test("A03-F-083 ⑦ hasSubmittedDayVote + 대상 → 낸 표시(기권 꺼짐·그 카드에 투표취소)", async () => {
  await refreshWith(snapshot({ extra: { dayPhaseDeadline: Date.now() + 30_000 }, self: { hasSubmittedDayVote: true, dayVoteTargetUuid: uuidOf(3), dayVoteRound: 1 } }))
  assert.equal(abstainButton()?.disabled, true)
  const items = await readCardMenu(3)
  assert.deepEqual(items.map((i) => i.name), ["투표취소"])
})

test("A03-F-084 ⑧ 2일 스냅샷 → 1일 결과 없음, 투표 현황 '집계 전'", async () => {
  const { state } = await refreshWith(snapshot({ dayIndex: 2, dayPhase: "DAY_DISCUSSION", extra: { dayPhaseDeadline: Date.now() + 60_000 } }))
  assert.equal(state?.dayIndex, 2)
  assert.equal(state?.dayVoteResolution ?? null, null)
  await click(buttonByName("투표 현황 열기"))
  assert.match(document.querySelector('[role="dialog"][aria-label="투표 현황"]')?.textContent ?? "", /집계 전/)
})

test("A03-F-085 ⑨ 죽은 나 스냅샷 → 표 잠김", async () => {
  await refreshWith(snapshot({ dead: [0], extra: { dayPhaseDeadline: Date.now() + 30_000 } }))
  // 죽은 사람 화면엔 기권 단추를 아예 안 그림 (준비·건너뛰기 단추와 같게, 모음 글 C-026) → 눌리는 기권이 없으면 됨
  assert.notEqual(abstainButton()?.disabled, false, "죽은 사람 화면에 눌리는 기권 단추가 있음")
  const items = await readCardMenu(2)
  assert.equal(items.some((i) => i.name === "투표하기" && i.enabled), false)
})

test("A03-F-086 ⑩ 토론 + 내 준비 기록 스냅샷 → 단추 '준비 완료'", async () => {
  await refreshWith(snapshot({ dayPhase: "DAY_DISCUSSION", extra: { dayPhaseDeadline: Date.now() + 60_000 }, self: { isDayVoteReady: true } }))
  const ready = document.querySelector('[data-ingame-phase-action="dayReady"]')
  assert.equal(ready?.textContent, "준비 완료")
})

test("A03-F-087 ⑪ 투표 단계 마감 스냅샷 → 시간 줄이 투표 마감으로 셈", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 })
  const { state } = await refreshWith(snapshot({ extra: { dayPhaseDeadline: T0 + 25_000 } }))
  assert.equal(state?.dayPhase, "DAY_VOTE")
  await click(buttonByName("시간흐름바 확대"))
  assert.equal(document.querySelector('[role="timer"]')?.textContent, "00:25")
})

test("A03-F-088 ⑫ 재판 스냅샷 피고 = 판정 결과 피고", async () => {
  const { state } = await refreshWith(snapshot({
    phase: "TRIBUNAL",
    extra: { tribunalDeadline: Date.now() + 50_000, dayVoteResolution: resolution("TRIBUNAL", { abstain: 2, target: uuidOf(4) }), tribunal: { defendantUuid: uuidOf(4), resolved: false } },
  }))
  assert.equal(state?.tribunal?.defendantUuid, uuidOf(4))
  assert.equal(state?.dayVoteResolution?.tribunalTargetUuid, uuidOf(4))
  assert.match(document.querySelector('[role="dialog"][aria-label="재판"]')?.textContent ?? "", new RegExp(NAMES[4]))
})
