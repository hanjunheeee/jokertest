import test from "node:test"
import assert from "node:assert/strict"
import { buildPlayerSessionSourceFromGameState } from "../buildPlayerSessionSourceFromGameState.js"

function validState(overrides = {}) {
  return {
    id: "game-1",
    phase: "ROLE_REVEAL",
    dayIndex: 0,
    players: [
      { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 3 },
      { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 7 },
    ],
    self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: [] },
    ...overrides,
  }
}

test("정상 입력: uuid→id, nickname→name, connected:true, alive:true로 변환된다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  assert.deepEqual(result.sourcePlayers[0], {
    id: "u1",
    name: "호스트",
    connected: true,
    alive: true,
    themeIndex: 3,
    role: "JOKER",
    team: "JOKER",
  })
  assert.deepEqual(result.sourcePlayers[1], {
    id: "u2",
    name: "참가자",
    connected: true,
    alive: true,
    themeIndex: 7,
  })
})

test("서버 themeIndex가 모든 참가자 항목에 그대로 전달된다(클라이언트 추첨 없음)", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  assert.deepEqual(
    result.sourcePlayers.map((p) => [p.id, p.themeIndex]),
    [["u1", 3], ["u2", 7]],
  )
})

test("players 원소에 themeIndex 키가 없으면 EMPTY_RESULT다(fail-closed)", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트", alive: true },
        { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 7 },
      ],
    }),
  )
  assert.equal(result.sourcePlayers, null)
  assert.equal(result.localPlayerId, null)
})

test("themeIndex가 정수가 아니거나 팔레트 범위 밖이면 EMPTY_RESULT다", () => {
  for (const badThemeIndex of ["3", 1.5, null, NaN, -1, 10]) {
    const result = buildPlayerSessionSourceFromGameState(
      validState({
        players: [
          { uuid: "u1", nickname: "호스트", alive: true, themeIndex: badThemeIndex },
          { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 7 },
        ],
      }),
    )
    assert.equal(result.sourcePlayers, null)
  }
})

test("self.uuid가 localPlayerId로 그대로 전달된다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  assert.equal(result.localPlayerId, "u1")
})

test("본인 항목에만 role/team이 있고 값이 state.self.role/team과 일치한다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  const self = result.sourcePlayers.find((p) => p.id === "u1")
  assert.equal(self.role, "JOKER")
  assert.equal(self.team, "JOKER")
})

test("본인이 아닌 다른 모든 참가자 항목에는 role/team 키 자체가 없다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  const other = result.sourcePlayers.find((p) => p.id === "u2")
  assert.equal(Object.hasOwn(other, "role"), false)
  assert.equal(Object.hasOwn(other, "team"), false)
})

test("입력 state(및 하위 players, self)가 호출 전후로 변형되지 않는다", () => {
  const state = validState()
  const before = JSON.parse(JSON.stringify(state))
  buildPlayerSessionSourceFromGameState(state)
  assert.deepEqual(state, before)
})

test("state가 null/undefined이면 안전한 fallback을 반환한다", () => {
  assert.deepEqual(buildPlayerSessionSourceFromGameState(null), { sourcePlayers: null, localPlayerId: null })
  assert.deepEqual(buildPlayerSessionSourceFromGameState(undefined), { sourcePlayers: null, localPlayerId: null })
})

test("state.players가 배열이 아니면 안전한 fallback을 반환한다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState({ players: "not-an-array" }))
  assert.equal(result.sourcePlayers, null)
  assert.equal(result.localPlayerId, null)
})

test("players 원소가 객체가 아니거나 uuid가 없거나 빈 문자열이면 목록 전체가 fallback된다", () => {
  const notObject = buildPlayerSessionSourceFromGameState(validState({ players: ["not-object", { uuid: "u2", nickname: "B" }] }))
  assert.equal(notObject.sourcePlayers, null)

  const missingUuid = buildPlayerSessionSourceFromGameState(
    validState({ players: [{ nickname: "A" }, { uuid: "u2", nickname: "B" }] }),
  )
  assert.equal(missingUuid.sourcePlayers, null)

  const emptyUuid = buildPlayerSessionSourceFromGameState(
    validState({ players: [{ uuid: "", nickname: "A" }, { uuid: "u2", nickname: "B" }] }),
  )
  assert.equal(emptyUuid.sourcePlayers, null)
})

test("players 원소의 nickname이 문자열이 아니면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ players: [{ uuid: "u1", nickname: 123 }, { uuid: "u2", nickname: "B" }] }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("players 원소의 nickname이 공백뿐인 문자열이면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ players: [{ uuid: "u1", nickname: "   " }, { uuid: "u2", nickname: "B" }] }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("players에 uuid가 중복된 원소가 있으면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ players: [{ uuid: "u1", nickname: "A" }, { uuid: "u1", nickname: "B" }] }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("state.self가 없거나 self.uuid가 players 목록에 없으면 EMPTY_RESULT다", () => {
  const noSelf = buildPlayerSessionSourceFromGameState(validState({ self: null }))
  assert.equal(noSelf.sourcePlayers, null)
  assert.equal(noSelf.localPlayerId, null)

  const unknownSelf = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "not-in-list", role: "JOKER" } }))
  assert.equal(unknownSelf.sourcePlayers, null)
  assert.equal(unknownSelf.localPlayerId, null)
})

test("state.self.role이 허용 목록(5개 역할)에 없는 값이면 EMPTY_RESULT다", () => {
  const typo = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: "Joker", team: "JOKER" } }))
  assert.equal(typo.sourcePlayers, null)

  const nullRole = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: null, team: "JOKER" } }))
  assert.equal(nullRole.sourcePlayers, null)

  const numberRole = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: 1, team: "JOKER" } }))
  assert.equal(numberRole.sourcePlayers, null)
})

test("CITIZEN 역할도 정상 통과한다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u2", nickname: "참가자", role: "CITIZEN", team: "CITIZEN" } }),
  )
  const self = result.sourcePlayers.find((p) => p.id === "u2")
  assert.equal(self.role, "CITIZEN")
  assert.equal(self.team, "CITIZEN")
  assert.equal(result.localPlayerId, "u2")
})

test("DOCTOR/GUARD/WITCH_HUNTER도 CITIZEN과 동일하게 self.role/team으로 정상 통과한다", () => {
  for (const role of ["DOCTOR", "GUARD", "WITCH_HUNTER"]) {
    const result = buildPlayerSessionSourceFromGameState(
      validState({ self: { uuid: "u2", nickname: "참가자", role, team: "CITIZEN" } }),
    )
    const self = result.sourcePlayers.find((p) => p.id === "u2")
    assert.equal(self.role, role)
    assert.equal(self.team, "CITIZEN")
    assert.equal(result.localPlayerId, "u2")
  }
})

test("role과 team이 각각은 허용 목록 안에 있어도 서로 대응하지 않는 조합이면 EMPTY_RESULT다", () => {
  const jokerWithCitizenTeam = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u1", role: "JOKER", team: "CITIZEN" } }),
  )
  assert.equal(jokerWithCitizenTeam.sourcePlayers, null)

  const doctorWithJokerTeam = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u2", nickname: "참가자", role: "DOCTOR", team: "JOKER" } }),
  )
  assert.equal(doctorWithJokerTeam.sourcePlayers, null)

  const missingTeam = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: "JOKER" } }))
  assert.equal(missingTeam.sourcePlayers, null)
})

test("self.role이 JOKER인데 allies own-property가 없으면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER" } }),
  )
  assert.equal(result.sourcePlayers, null)
  assert.equal(result.localPlayerId, null)
})

test("self.role이 JOKER가 아닌데 allies가 존재하면(빈 배열이어도) EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u2", nickname: "참가자", role: "CITIZEN", team: "CITIZEN", allies: [] } }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("self.allies가 배열이 아니면 EMPTY_RESULT다", () => {
  for (const badAllies of ["u2", {}, null, 1]) {
    const result = buildPlayerSessionSourceFromGameState(
      validState({ self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: badAllies } }),
    )
    assert.equal(result.sourcePlayers, null)
  }
})

test("self.allies가 배열이어도 원소가 문자열이 아니거나 빈 문자열이면 EMPTY_RESULT다", () => {
  for (const badAllies of [[1], [""]]) {
    const result = buildPlayerSessionSourceFromGameState(
      validState({ self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: badAllies } }),
    )
    assert.equal(result.sourcePlayers, null)
  }
})

test("self.allies에 players 목록에 없는 uuid가 있으면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: ["not-in-list"] } }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("self.allies에 자기 자신의 uuid가 있으면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: ["u1"] } }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("self.allies에 중복 uuid가 있으면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트" },
        { uuid: "u2", nickname: "참가자" },
        { uuid: "u3", nickname: "참가자2" },
      ],
      self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: ["u2", "u2"] },
    }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("allies:[]인 정상 케이스는 통과하고 어떤 항목에도 isAlly가 없다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  for (const player of result.sourcePlayers) {
    assert.equal(Object.hasOwn(player, "isAlly"), false)
  }
})

test("allies에 있는 uuid의 sourcePlayers 항목에는 isAlly:true가 붙고, 없는 항목엔 키 자체가 없다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0 },
        { uuid: "u2", nickname: "동료", alive: true, themeIndex: 1 },
        { uuid: "u3", nickname: "시민", alive: true, themeIndex: 2 },
      ],
      self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: ["u2"] },
    }),
  )
  const ally = result.sourcePlayers.find((p) => p.id === "u2")
  const citizen = result.sourcePlayers.find((p) => p.id === "u3")
  const self = result.sourcePlayers.find((p) => p.id === "u1")
  assert.equal(ally.isAlly, true)
  assert.equal(Object.hasOwn(citizen, "isAlly"), false)
  assert.equal(Object.hasOwn(self, "isAlly"), false)
})

test("F-13 AC-05: accountProfilePhotoId/accountProfileBorderId가 있는 참가자 항목에는 그대로 복사되고 없는 항목엔 키 자체가 없다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountProfilePhotoId: "player-profile-기사", accountProfileBorderId: "profile-border-귀족" },
        { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1 },
      ],
    }),
  )
  const withProfile = result.sourcePlayers.find((p) => p.id === "u1")
  const withoutProfile = result.sourcePlayers.find((p) => p.id === "u2")
  assert.equal(withProfile.accountProfilePhotoId, "player-profile-기사")
  assert.equal(withProfile.accountProfileBorderId, "profile-border-귀족")
  assert.equal(Object.hasOwn(withoutProfile, "accountProfilePhotoId"), false)
  assert.equal(Object.hasOwn(withoutProfile, "accountProfileBorderId"), false)
})

test("F-13 AC-05: accountProfilePhotoId/accountProfileBorderId가 null이어도(미보유) own-property면 그대로 복사된다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountProfilePhotoId: null, accountProfileBorderId: null },
        { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1 },
      ],
    }),
  )
  const self = result.sourcePlayers.find((p) => p.id === "u1")
  assert.equal(Object.hasOwn(self, "accountProfilePhotoId"), true)
  assert.equal(self.accountProfilePhotoId, null)
  assert.equal(Object.hasOwn(self, "accountProfileBorderId"), true)
  assert.equal(self.accountProfileBorderId, null)
})

test("F-14 AC-01/AC-04: accountCardFrameId가 있는 참가자 항목에는 그대로 복사되고 없는 항목엔 키 자체가 없다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountCardFrameId: "player-card-왕관" },
        { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1 },
      ],
    }),
  )
  const withCard = result.sourcePlayers.find((p) => p.id === "u1")
  const withoutCard = result.sourcePlayers.find((p) => p.id === "u2")
  assert.equal(withCard.accountCardFrameId, "player-card-왕관")
  assert.equal(Object.hasOwn(withoutCard, "accountCardFrameId"), false)
})

test("R-IMPL(2026-09-11): player.isConnected이 boolean으로 있으면 connected에 그 값이 그대로 전달된다(하드코딩된 true가 아니다)", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, isConnected: false },
        { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1, isConnected: true },
      ],
    }),
  )
  assert.equal(
    result.sourcePlayers.find((p) => p.id === "u1").connected,
    false,
    "isConnected:false는 connected:false로 이어져야 한다 — 연결 끊김 오버레이가 실제로 뜨려면 이 값이 살아 있어야 한다(실제 Chrome 회귀: applySessionSnapshot은 isConnected를 보존했는데 이 함수가 connected를 하드코딩해 오버레이가 뜨지 않았다)",
  )
  assert.equal(result.sourcePlayers.find((p) => p.id === "u2").connected, true)
})

test("R-IMPL(2026-09-11): player.isConnected 필드 자체가 없는 참가자는(레거시 입력) connected:true로만 안전하게 대체된다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  for (const player of result.sourcePlayers) {
    assert.equal(player.connected, true)
  }
})

test("동료가 2명 이상이면 각 동료 uuid 모두에 isAlly:true가 붙는다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0 },
        { uuid: "u2", nickname: "동료B", alive: true, themeIndex: 1 },
        { uuid: "u3", nickname: "동료C", alive: true, themeIndex: 2 },
        { uuid: "u4", nickname: "시민", alive: true, themeIndex: 3 },
      ],
      self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: ["u2", "u3"] },
    }),
  )
  assert.equal(result.sourcePlayers.find((p) => p.id === "u2").isAlly, true)
  assert.equal(result.sourcePlayers.find((p) => p.id === "u3").isAlly, true)
  assert.equal(Object.hasOwn(result.sourcePlayers.find((p) => p.id === "u4"), "isAlly"), false)
})

// ── CO S-1(AC-05): 계정 전적(총 판수·승률)의 own-property 조건부 복사 ─────────────

test("계정 전적은 값이 있는 참가자에게만 정확히 복사되고, 0판 0%도 그대로 옮겨진다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountTotalGames: 3, accountWinRate: 67 },
        // 0판 0%는 "조회 실패"가 아니라 서버가 말한 사실이다 — falsy라고 빠뜨리면 안 된다.
        { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1, accountTotalGames: 0, accountWinRate: 0 },
      ],
      self: { uuid: "u1", nickname: "호스트", role: "CITIZEN", team: "CITIZEN" },
    }),
  )
  assert.equal(result.sourcePlayers[0].accountTotalGames, 3)
  assert.equal(result.sourcePlayers[0].accountWinRate, 67)
  assert.equal(Object.hasOwn(result.sourcePlayers[1], "accountTotalGames"), true)
  assert.equal(result.sourcePlayers[1].accountTotalGames, 0)
  assert.equal(result.sourcePlayers[1].accountWinRate, 0)
})

test("계정 전적 키가 없는 참가자에게는 키 자체가 생기지 않는다(상속 값도 만들지 않는다)", () => {
  const inherited = Object.create({ accountTotalGames: 99, accountWinRate: 99 })
  Object.assign(inherited, { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1 })

  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0 },
        inherited,
      ],
      self: { uuid: "u1", nickname: "호스트", role: "CITIZEN", team: "CITIZEN" },
    }),
  )
  for (const entry of result.sourcePlayers) {
    assert.equal(Object.hasOwn(entry, "accountTotalGames"), false)
    assert.equal(Object.hasOwn(entry, "accountWinRate"), false)
  }
})

test("계정 전적을 옮겨도 입력 state의 player 객체는 변형되지 않는다", () => {
  const players = [
    { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountTotalGames: 3, accountWinRate: 67 },
    { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1 },
  ]
  const before = players.map((p) => JSON.stringify(p))

  buildPlayerSessionSourceFromGameState(
    validState({ players, self: { uuid: "u1", nickname: "호스트", role: "CITIZEN", team: "CITIZEN" } }),
  )

  assert.deepEqual(players.map((p) => JSON.stringify(p)), before)
})

// builder → merge 연결: builder가 옮긴 전적이 실제 병합 단계까지 살아남아야 화면에 도달한다.
test("builder가 만든 sourcePlayers를 실제 mergeSourcePlayerWithPreview에 넘겨도 전적이 남는다", async () => {
  const { mergeSourcePlayerWithPreview } = await import("../mergeSourcePlayerWithPreview.js")
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트", alive: true, themeIndex: 0, accountTotalGames: 3, accountWinRate: 67 },
        { uuid: "u2", nickname: "참가자", alive: true, themeIndex: 1 },
      ],
      self: { uuid: "u1", nickname: "호스트", role: "CITIZEN", team: "CITIZEN" },
    }),
  )

  const preview = { id: "slot", nickname: "미리보기", portraitSrc: "p.png", frameSrc: "f.png", themeIndex: 0, theme: {} }
  const merged = result.sourcePlayers.map((player) => mergeSourcePlayerWithPreview(player, preview))

  assert.equal(merged[0].accountTotalGames, 3)
  assert.equal(merged[0].accountWinRate, 67)
  assert.equal(Object.hasOwn(merged[1], "accountTotalGames"), false)
  assert.equal(Object.hasOwn(merged[1], "accountWinRate"), false)
})
