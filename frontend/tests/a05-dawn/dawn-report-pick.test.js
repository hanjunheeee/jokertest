// 낮 시작 연출 고르기·글 시험(순수): 밤 결과 값 → 살해 연출 / 살림 연출 / 없음, 그리고 화면 글 모양
// 목록 시험목록/A05b-밤-알림-낮연출.md A05-F-501~520, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-dawn/dawn-report-pick.test.js
import test from "node:test"
import assert from "node:assert/strict"

const { buildDawnReport, buildDawnReportMessage } = await import("../../src/domains/game/ingame/utils/dawnReport.js")

// 6명 명단 (닉네임만 씀), A = a0
const roster = (nicknames = ["여름", "가을", "겨울", "새벽", "노을", "구름"]) =>
  nicknames.map((nickname, i) => ({ uuid: `a${i}`, nickname }))
const ROLE_WORDS = /광대|시민|귀족|의사|경비원|마녀사냥꾼/

// 서버 밤 결과 → 연출 값 (판 g1, 1일 밤)
const pick = (fields, { players = roster(), nightDayIndex = 1 } = {}) =>
  buildDawnReport({ gameId: "g1", nightDayIndex, players, ...fields })

test("A05-F-501 광대에게 죽은 사람(A)이 있으면 → 살해 연출, 당한 사람 A 닉네임", () => {
  const report = pick({ deathReveals: [{ victimUuid: "a0", source: "JOKER" }], victimUuid: "a0" })
  assert.equal(report?.kind, "KILLED")
  assert.deepEqual(report.victims.map((v) => v.nickname), ["여름"])
})

test("A05-F-502 광대 아닌 원인(UNKNOWN_NIGHT)만 있으면 → 연출 없음", () => {
  const report = pick({ deathReveals: [{ victimUuid: "a0", source: "UNKNOWN_NIGHT" }] })
  assert.equal(report, null)
})

test("A05-F-503 의사가 살림(doctorSaved 참), 희생자 없음 → 살림 연출, 이름 목록 비어 있음", () => {
  const report = pick({ deathReveals: [], victimUuid: null, doctorSaved: true })
  assert.equal(report?.kind, "SAVED")
  assert.equal(report.victims.length, 0)
})

test("A05-F-504 [지금 동작] 희생자와 doctorSaved 참이 같이 오면 → 살해 연출만", () => {
  const report = pick({ deathReveals: [{ victimUuid: "a0", source: "JOKER" }], victimUuid: "a0", doctorSaved: true })
  assert.equal(report?.kind, "KILLED")
})

test("A05-F-505 희생자 없음 + doctorSaved 거짓 → 연출 없음", () => {
  const report = pick({ deathReveals: [], victimUuid: null, doctorSaved: false })
  assert.equal(report, null)
})

test("A05-F-506 [지금 동작] 희생자가 명단에 없는 uuid → 연출 없음", () => {
  const report = pick({ deathReveals: [{ victimUuid: "zz", source: "JOKER" }], victimUuid: "zz" })
  assert.equal(report, null)
})

test("A05-F-507 같은 판 1밤·2밤 같은 살해 연출 → 구별 표시(key)가 서로 다름", () => {
  const first = pick({ deathReveals: [{ victimUuid: "a0", source: "JOKER" }] }, { nightDayIndex: 1 })
  const second = pick({ deathReveals: [{ victimUuid: "a1", source: "JOKER" }] }, { nightDayIndex: 2 })
  assert.equal(first?.kind, "KILLED")
  assert.equal(second?.kind, "KILLED")
  assert.notEqual(first.key, second.key)
})

test("A05-F-508 [지금 동작] 사망 공개 칸 없는 옛 값 + victimUuid A → 살해 연출 A", () => {
  const report = pick({ victimUuid: "a0" })
  assert.equal(report?.kind, "KILLED")
  assert.deepEqual(report.victims.map((v) => v.uuid), ["a0"])
})

test("A05-F-509 [지금 동작] 같은 사람이 사망 공개에 두 번 → 이름 1개", () => {
  const report = pick({ deathReveals: [{ victimUuid: "a0", source: "JOKER" }, { victimUuid: "a0", source: "JOKER" }] })
  assert.equal(report?.victims.length, 1)
})

// 살해 글의 닉네임 모양 (빈칸은 다듬고, 꺾쇠는 글자 그대로)
const NICKNAME_CASES = [
  ["철수", "철수"],
  ["Kim", "Kim"],
  ["user01", "user01"],
  [" 영희 ", "영희"],
  ["<b>x</b>", "<b>x</b>"],
]
NICKNAME_CASES.forEach(([nickname, shown], i) => {
  test(`A05-F-${510 + i} 살해 글 닉네임 ${JSON.stringify(nickname)} → "지난밤 ${shown}님이 살해당했습니다"`, () => {
    const players = roster([nickname, "가을", "겨울", "새벽", "노을", "구름"])
    const report = pick({ deathReveals: [{ victimUuid: "a0", source: "JOKER" }] }, { players })
    assert.equal(buildDawnReportMessage(report), `지난밤 ${shown}님이 살해당했습니다`)
  })
})

test("A05-F-515 살림 글 → \"지난밤 의사가 공격받은 사람을 살려냈습니다\" 그대로", () => {
  const report = pick({ deathReveals: [], doctorSaved: true })
  assert.equal(buildDawnReportMessage(report), "지난밤 의사가 공격받은 사람을 살려냈습니다")
})

// 당한 사람 직업이 무엇이든 글에 직업 이름 없음 (명단엔 직업이 없고, 서버 공개 값에도 없음)
const VICTIM_ROLES = ["CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"]
VICTIM_ROLES.forEach((role, i) => {
  test(`A05-F-${516 + i} 당한 사람 직업 ${role} → 살해 글에 광대·시민·의사·경비원·마녀사냥꾼 없음`, () => {
    // 화면 명단 줄에 직업 칸이 실려 와도 글에는 안 씀
    const players = roster().map((p, idx) => (idx === 0 ? { ...p, role } : p))
    const report = pick({ deathReveals: [{ victimUuid: "a0", source: "JOKER" }] }, { players })
    const text = buildDawnReportMessage(report)
    assert.equal(typeof text, "string")
    assert.doesNotMatch(text, ROLE_WORDS)
  })
})

test("A05-F-520 [지금 동작] 당한 사람 닉네임이 빈 글 → \"지난밤 누군가 살해당했습니다\"", () => {
  const players = roster(["", "가을", "겨울", "새벽", "노을", "구름"])
  const report = pick({ deathReveals: [{ victimUuid: "a0", source: "JOKER" }] }, { players })
  assert.equal(buildDawnReportMessage(report), "지난밤 누군가 살해당했습니다")
})
