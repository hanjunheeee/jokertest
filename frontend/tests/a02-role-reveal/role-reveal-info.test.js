// 역할 확인 정보 풀기 시험: 서버 self 값 → 창에 쓸 직업 이름·진영·동료 목록·서 있는 그림 (화면 상태)
// 목록 A02-F-001~022 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"
import { buildSelf, firstOf, seatCode } from "./a02Fixtures.mjs"

const { getInGameRoleRevealInfo, resolveInGameRoleRevealAllies } = await import("../../src/domains/game/ingame/utils/roleReveal.js")

// 내 self 값으로 역할 정보 풀기 (로그인 uuid = 나)
const infoOf = (self, authUuid = self.uuid) => getInGameRoleRevealInfo(self, { authUuid })

// 다섯 직업이 다 있는 5명 직접 구성 판
const ALL_FIVE = seatCode("J1D1G1W1C1", { gameTag: "info" })

// A02-F-001~005 직업 이름·진영 (광대만 광대 진영)
const NAME_CASES = [
  ["A02-F-001", "JOKER", "광대", "광대 진영"],
  ["A02-F-002", "CITIZEN", "귀족", "시민 진영"],
  ["A02-F-003", "DOCTOR", "의사", "시민 진영"],
  ["A02-F-004", "GUARD", "경비원", "시민 진영"],
  ["A02-F-005", "WITCH_HUNTER", "마녀사냥꾼", "시민 진영"],
]
for (const [no, role, name, team] of NAME_CASES) {
  test(`${no} ${name} self → 이름 "${name}", 진영 "${team}"`, () => {
    const me = firstOf(ALL_FIVE, role)
    const info = infoOf(buildSelf(ALL_FIVE, me))
    assert.equal(info.roleName, name)
    assert.equal(info.teamLabel, team)
    // "귀족"은 시민 직업만의 이름 (마녀사냥꾼 등 다른 직업을 귀족으로 부르지 않음)
    if (role !== "CITIZEN") assert.doesNotMatch(info.roleName, /귀족/)
  })
}

// 같은 직업 2명 판 (5명 직접 구성)
const PAIR_CODES = { JOKER: "J2C3", DOCTOR: "J1D2C2", GUARD: "J1G2C2", WITCH_HUNTER: "J1W2C2" }

// A02-F-006~009 같은 직업 2명이면 동료 목록 [상대]
const PAIR_CASES = [["A02-F-006", "JOKER"], ["A02-F-007", "DOCTOR"], ["A02-F-008", "GUARD"], ["A02-F-009", "WITCH_HUNTER"]]
for (const [no, role] of PAIR_CASES) {
  test(`${no} ${role} 2명 판: 동료 목록 = [상대]`, () => {
    const seats = seatCode(PAIR_CODES[role], { gameTag: `pair-${role}` })
    const [me, partner] = seats.filter((p) => p.role === role)
    const info = infoOf(buildSelf(seats, me))
    assert.deepEqual(info.allies, [partner.uuid])
  })
}

// A02-F-010~013 같은 직업 1명이면 빈 목록
const SOLO_CASES = [["A02-F-010", "JOKER"], ["A02-F-011", "DOCTOR"], ["A02-F-012", "GUARD"], ["A02-F-013", "WITCH_HUNTER"]]
for (const [no, role] of SOLO_CASES) {
  test(`${no} ${role} 1명 판: allies [] → 동료 목록 빈 것`, () => {
    const me = firstOf(ALL_FIVE, role)
    const info = infoOf(buildSelf(ALL_FIVE, me))
    assert.deepEqual(info.allies, [])
  })
}

test("A02-F-014 시민 self → 동료 목록 없음(null)", () => {
  const me = firstOf(ALL_FIVE, "CITIZEN")
  const info = infoOf(buildSelf(ALL_FIVE, me))
  assert.equal(info.roleName, "귀족")
  assert.equal(info.allies, null)
})

test("A02-F-015 시민 self에 allies가 실려 와도 동료 목록 없음", () => {
  const seats = seatCode("J1C4", { gameTag: "cit-allies" })
  const [me, other] = seats.filter((p) => p.role === "CITIZEN")
  const info = infoOf(buildSelf(seats, me, { allies: [other.uuid] }))
  assert.equal(info?.allies ?? null, null)
})

test("A02-F-016 [지금 동작] 로그인 uuid와 다른 self → 역할 정보 없음(창 안 띄움)", () => {
  const me = firstOf(ALL_FIVE, "DOCTOR")
  const someoneElse = firstOf(ALL_FIVE, "GUARD")
  assert.equal(infoOf(buildSelf(ALL_FIVE, me), someoneElse.uuid), null)
})

test("A02-F-017 [지금 동작] 광대인데 팀 CITIZEN → 역할 정보 없음", () => {
  const me = firstOf(ALL_FIVE, "JOKER")
  const self = { ...buildSelf(ALL_FIVE, me), team: "CITIZEN" }
  assert.equal(infoOf(self), null)
})

// A02-F-018~019 서 있는 그림: 계정 스킨이면 그 그림, 없으면 직업 기본 그림
test("A02-F-018 계정 스킨(광대2) 낀 광대 → 그 스킨 서 있는 그림", () => {
  const me = firstOf(ALL_FIVE, "JOKER")
  const info = infoOf(buildSelf(ALL_FIVE, me, { accountSkinId: "basic-skin-광대2" }))
  assert.equal(info.standingSrc, "/shopItem/basic/jobs-standing/광대2.webp".normalize("NFD"))
})

test("A02-F-019 스킨 안 낀 광대(accountSkinId null) → 광대 기본 그림", () => {
  const me = firstOf(ALL_FIVE, "JOKER")
  const info = infoOf(buildSelf(ALL_FIVE, me, { accountSkinId: null }))
  assert.equal(info.standingSrc, "/shopItem/basic/jobs-standing/광대1.webp".normalize("NFD"))
})

// 6명 판 명단 (동료 닉네임 짝짓기용)
const SIX = seatCode("J1D2C3", { gameTag: "nick" })
const SIX_PLAYERS = SIX.map(({ uuid, nickname }) => ({ uuid, nickname }))

test("A02-F-020 동료 uuid [B] + 판 사람 목록 → [{B, B 닉네임}]", () => {
  const [, b] = SIX.filter((p) => p.role === "DOCTOR")
  assert.deepEqual(resolveInGameRoleRevealAllies([b.uuid], SIX_PLAYERS), [{ uuid: b.uuid, nickname: b.nickname }])
})

test("A02-F-021 [지금 동작] 판 사람 목록에 없는 uuid → 그 줄 빠짐", () => {
  const [, b] = SIX.filter((p) => p.role === "DOCTOR")
  assert.deepEqual(
    resolveInGameRoleRevealAllies(["outside-uuid", b.uuid], SIX_PLAYERS),
    [{ uuid: b.uuid, nickname: b.nickname }],
  )
})

test("A02-F-022 빈 동료 목록 [] → []", () => {
  assert.deepEqual(resolveInGameRoleRevealAllies([], SIX_PLAYERS), [])
})
