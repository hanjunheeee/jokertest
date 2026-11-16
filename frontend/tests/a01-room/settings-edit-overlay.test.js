// 설정 바꾸기 창 시험(대기방 화면 전체 + 가짜 소켓): 지금 설정으로 열림, 칸 다 있음, 경계 단추, 저장 요청 값, 저장 중 꺼짐, 거절 글, 취소, 직접/자동 저장, 합 넘음
// 목록 A01a "화면 PC" A01-F-175~196, 방장 화면, 5명 방(정원 줄이기 거절만 7명 방)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { screen, fireEvent, cleanup, waitFor, act } = await import("@testing-library/react")
const H = await import("./a01a-helpers.mjs")

const MAX = "최대 플레이어 수"
const JOKER = "광대(마피아) 플레이어 수"
const TALK = "낮 토론 시간 조절"
const VOTE = "낮 투표 시간 조절"
const TRIAL = "재판 시간 조절"
const NIGHT = "밤 행동 시간 조절"

test.beforeEach(() => {
  H.resetAll()
  H.catchDialogs({ confirm: false })
})
test.afterEach(() => cleanup())

// 방장이 대기방에서 설정 바꾸기 창을 엶 (방 확인 끝난 뒤 "방 설정 변경")
async function openEditor({ room = H.roomOf({ n: 5, settingsVersion: 4 }), saveAnswer } = {}) {
  const r = H.renderMatchingPage({ room })
  if (saveAnswer !== undefined) r.socket.answer("update_room_settings", saveAnswer)
  const open = await waitFor(() => screen.getByRole("button", { name: "방 설정 변경" }))
  fireEvent.click(open)
  assert.ok(screen.getByRole("dialog", { name: "방 설정 변경" }))
  return r
}
const meetingTab = () => fireEvent.click(screen.getByRole("button", { name: "회의&투표" }))
const generalTab = () => fireEvent.click(screen.getByRole("button", { name: "일반" }))
const saveButton = () => H.buttonNamed("설정 저장")

test("A01-F-175 방 설정 정원 7·광대 1·토론 90 → 창 칸이 그 값", async () => {
  await openEditor({ room: H.roomOf({ n: 5, settings: { maxPlayers: 7, jokerCount: 1, dayDiscussionTime: 90 } }) })
  assert.equal(H.stepperValue(MAX), 7)
  assert.equal(H.stepperValue(JOKER), 1)
  meetingTab()
  assert.equal(H.stepperValue(TALK), 90)
})

test("A01-F-176 창 → 코드로만 참가·정원·광대·구성·토론·투표·재판·밤 칸 모두 있음", async () => {
  await openEditor()
  assert.ok(screen.getByRole("checkbox", { name: "코드로만 참가" }))
  for (const label of [MAX, JOKER, "역할 구성"]) assert.ok(H.buttonNamed(`${label} 증가`), `${label} 있음`)
  meetingTab()
  for (const label of [TALK, VOTE, TRIAL, NIGHT]) assert.ok(H.buttonNamed(`${label} 증가`), `${label} 있음`)
})

const EDGE_CASES = [
  ["A01-F-177", "정원 5 −", MAX, 5, "감소", false],
  ["A01-F-178", "정원 10 +", MAX, 10, "증가", false],
  ["A01-F-179", "광대 1 −", JOKER, 1, "감소", false],
  ["A01-F-180", "광대 2 +", JOKER, 2, "증가", false],
  ["A01-F-181", "토론 30 −", TALK, 30, "감소", true],
  ["A01-F-182", "토론 150 +", TALK, 150, "증가", true],
  ["A01-F-183", "투표 30 −", VOTE, 30, "감소", true],
  ["A01-F-184", "투표 90 +", VOTE, 90, "증가", true],
  ["A01-F-185", "재판 15 −", TRIAL, 15, "감소", true],
  ["A01-F-186", "재판 120 +", TRIAL, 120, "증가", true],
  ["A01-F-187", "밤 30 −", NIGHT, 30, "감소", true],
  ["A01-F-188", "밤 120 +", NIGHT, 120, "증가", true],
]
for (const [no, name, label, value, side, onMeeting] of EDGE_CASES) {
  test(`${no} 창 ${name} → 꺼짐`, async () => {
    await openEditor()
    if (onMeeting) meetingTab()
    H.stepTo(label, value)
    assert.equal(H.buttonNamed(`${label} ${side}`).disabled, true)
    assert.equal(H.buttonNamed(`${label} ${side === "감소" ? "증가" : "감소"}`).disabled, false)
  })
}

test("A01-F-189 정원 8로 '설정 저장' → update_room_settings에 maxPlayers 8·방 id·expectedSettingsVersion = 지금 버전", async () => {
  const { socket } = await openEditor({ saveAnswer: { ok: true, changed: true, settingsVersion: 5 } })
  H.stepTo(MAX, 8)
  H.press("설정 저장")
  await waitFor(() => assert.equal(socket.sentOf("update_room_settings").length, 1))
  const sent = socket.sentOf("update_room_settings")[0]
  assert.equal(sent.maxPlayers, 8)
  assert.equal(sent.roomId, "room-1")
  assert.equal(sent.expectedSettingsVersion, 4)
})

test("A01-F-190 저장 답 전 → '설정 저장' 꺼짐", async () => {
  const later = H.deferred()
  await openEditor({ saveAnswer: () => later.promise })
  H.stepTo(MAX, 8)
  H.press("설정 저장")
  await waitFor(() => assert.equal(saveButton().disabled, true))
  await act(async () => later.resolve({ ok: true, changed: true, settingsVersion: 5 }))
})

test("A01-F-191 답 MAX_PLAYERS_BELOW_OCCUPANCY → 창에 '현재 인원(7명)보다 적은 정원으로는 변경할 수 없습니다.'", async () => {
  const message = "현재 인원(7명)보다 적은 정원으로는 변경할 수 없습니다."
  await openEditor({
    room: H.roomOf({ n: 7, settingsVersion: 4 }),
    saveAnswer: { ok: false, code: "MAX_PLAYERS_BELOW_OCCUPANCY", message },
  })
  H.stepTo(MAX, 5)
  H.press("설정 저장")
  await waitFor(() => assert.ok(document.body.textContent.includes(message)))
})

test("A01-F-192 답 SETTINGS_VERSION_CONFLICT → '설정이 이미 변경되었습니다…' 글, 칸이 최신 값", async () => {
  const latest = H.roomOf({ n: 5, settingsVersion: 6, settings: { maxPlayers: 9 } })
  await openEditor({
    saveAnswer: {
      ok: false,
      code: "SETTINGS_VERSION_CONFLICT",
      message: "설정이 이미 변경되었습니다. 최신 설정을 불러온 뒤 다시 시도해주세요.",
      room: latest,
    },
  })
  H.stepTo(MAX, 8)
  H.press("설정 저장")
  await waitFor(() => assert.ok(document.body.textContent.includes("설정이 이미 변경되었습니다")))
  assert.equal(H.stepperValue(MAX), 9)
})

test("A01-F-193 정원 바꾸고 취소 → 요청 안 보냄, 다시 열면 옛 값", async () => {
  const { socket } = await openEditor()
  H.stepTo(MAX, 6)
  fireEvent.click(screen.getByRole("button", { name: "설정 변경 취소" }))
  assert.ok(screen.queryByRole("dialog", { name: "방 설정 변경" }) === null, "창 닫힘")
  fireEvent.click(screen.getByRole("button", { name: "방 설정 변경" }))
  assert.equal(H.stepperValue(MAX), 10)
  assert.equal(socket.sentOf("update_room_settings").length, 0)
})

test("A01-F-194 구성 '직접 지정' J1D1 저장 → 요청에 roleCompositionMode 'custom'·roleCounts", async () => {
  const { socket } = await openEditor({
    room: H.roomOf({ n: 5, settingsVersion: 4, settings: { jokerCount: 1 } }),
    saveAnswer: { ok: true, changed: true, settingsVersion: 5 },
  })
  H.press("역할 구성 증가")
  H.stepTo("광대 인원", 1)
  H.stepTo("의사 인원", 1)
  H.press("설정 저장")
  await waitFor(() => assert.equal(socket.sentOf("update_room_settings").length, 1))
  const sent = socket.sentOf("update_room_settings")[0]
  assert.equal(sent.roleCompositionMode, "custom")
  assert.deepEqual(sent.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
})

test("A01-F-195 직접 → 자동으로 되돌려 저장 → 요청에 roleCounts 없음", async () => {
  const { socket } = await openEditor({
    room: H.roomOf({
      n: 5,
      settingsVersion: 4,
      settings: { jokerCount: 1, roleCompositionMode: "custom", roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 } },
    }),
    saveAnswer: { ok: true, changed: true, settingsVersion: 5 },
  })
  assert.equal(H.stepperText("역할 구성"), "직접 지정")
  H.press("역할 구성 감소")
  H.press("설정 저장")
  await waitFor(() => assert.equal(socket.sentOf("update_room_settings").length, 1))
  const sent = socket.sentOf("update_room_settings")[0]
  assert.equal(sent.roleCompositionMode, "auto")
  assert.equal(Object.hasOwn(sent, "roleCounts"), false)
})

test("A01-F-196 창에서 정원 7 + J2D2G2W2 → 오류 글, '설정 저장' 꺼짐", async () => {
  await openEditor({ room: H.roomOf({ n: 5, settingsVersion: 4, settings: { maxPlayers: 7 } }) })
  H.press("역할 구성 증가")
  for (const label of ["광대 인원", "의사 인원", "경비원 인원", "마녀사냥꾼 인원"]) H.stepTo(label, 2)
  generalTab()
  assert.ok(document.body.textContent.includes("지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다."))
  assert.equal(saveButton().disabled, true)
})
