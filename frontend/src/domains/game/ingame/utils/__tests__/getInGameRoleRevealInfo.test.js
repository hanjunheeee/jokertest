import test from "node:test"
import assert from "node:assert/strict"
import { getInGameRoleRevealInfo } from "../getInGameRoleRevealInfo.js"
import { getDefaultSkinIdForJob, getSkinCardWearItemById } from "../../../../user/constants/skinCardWear/skinCardWearCatalog.js"

const AUTH_UUID = "player-1"

function buildSelf(overrides = {}) {
  return {
    uuid: AUTH_UUID,
    nickname: "Alice",
    role: "CITIZEN",
    team: "CITIZEN",
    ...overrides,
  }
}

test("getInGameRoleRevealInfo: self가 없으면 null이다(역할 데이터 없음 => 공개 없음)", () => {
  assert.equal(getInGameRoleRevealInfo(null, { authUuid: AUTH_UUID }), null)
  assert.equal(getInGameRoleRevealInfo(undefined, { authUuid: AUTH_UUID }), null)
})

test("getInGameRoleRevealInfo: authUuid가 없으면 null이다", () => {
  assert.equal(getInGameRoleRevealInfo(buildSelf(), {}), null)
  assert.equal(getInGameRoleRevealInfo(buildSelf(), { authUuid: null }), null)
})

test("getInGameRoleRevealInfo: self.uuid가 authUuid와 다르면 null이다(이전 계정/다른 게임의 stale self)", () => {
  const self = buildSelf({ uuid: "other-uuid" })
  assert.equal(getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID }), null)
})

test("getInGameRoleRevealInfo: nickname이 비어있으면 null이다", () => {
  assert.equal(getInGameRoleRevealInfo(buildSelf({ nickname: "" }), { authUuid: AUTH_UUID }), null)
  assert.equal(getInGameRoleRevealInfo(buildSelf({ nickname: "   " }), { authUuid: AUTH_UUID }), null)
})

test("getInGameRoleRevealInfo: 알 수 없는 role이면 null이다", () => {
  assert.equal(getInGameRoleRevealInfo(buildSelf({ role: "UNKNOWN" }), { authUuid: AUTH_UUID }), null)
})

test("getInGameRoleRevealInfo: role과 team 조합이 어긋나면 null이다", () => {
  assert.equal(
    getInGameRoleRevealInfo(buildSelf({ role: "JOKER", team: "CITIZEN" }), { authUuid: AUTH_UUID }),
    null,
  )
})

test("getInGameRoleRevealInfo: 유효한 CITIZEN self는 allies 없이 완전한 표시 정보를 반환한다", () => {
  const result = getInGameRoleRevealInfo(buildSelf(), { authUuid: AUTH_UUID })
  assert.ok(result)
  assert.equal(result.uuid, AUTH_UUID)
  assert.equal(result.nickname, "Alice")
  assert.equal(result.role, "CITIZEN")
  assert.equal(typeof result.roleName, "string")
  assert.equal(typeof result.teamLabel, "string")
  assert.equal(typeof result.description, "string")
  assert.equal(result.allies, null)
})

test("getInGameRoleRevealInfo: 유효한 JOKER self는 allies 배열을 그대로 반환한다", () => {
  const self = buildSelf({ role: "JOKER", team: "JOKER", allies: ["ally-1", "ally-2"] })
  const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })
  assert.ok(result)
  assert.deepEqual(result.allies, ["ally-1", "ally-2"])
})

test("getInGameRoleRevealInfo: JOKER인데 allies가 배열이 아니면 null이다(오염된 payload 방어)", () => {
  const self = buildSelf({ role: "JOKER", team: "JOKER", allies: "not-an-array" })
  assert.equal(getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID }), null)
})

test("getInGameRoleRevealInfo: CITIZEN 등 비-JOKER는 allies 필드가 섞여 들어와도 절대 노출하지 않는다", () => {
  const self = buildSelf({ role: "CITIZEN", team: "CITIZEN", allies: ["should-not-leak"] })
  const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })
  assert.ok(result)
  assert.equal(result.allies, null)
})

test("getInGameRoleRevealInfo: 각 역할은 서로 다른 roleName/description을 가진다(빈 값이 아님)", () => {
  const roles = ["JOKER", "CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"]
  const names = new Set()
  for (const role of roles) {
    const team = role === "JOKER" ? "JOKER" : "CITIZEN"
    const self = buildSelf({ role, team, ...(role === "JOKER" ? { allies: [] } : {}) })
    const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })
    assert.ok(result, `role=${role}`)
    assert.ok(result.roleName.length > 0, `role=${role}`)
    assert.ok(result.description.length > 0, `role=${role}`)
    names.add(result.roleName)
  }
  assert.equal(names.size, roles.length, "역할별 roleName은 서로 달라야 한다")
})

test("getInGameRoleRevealInfo: self.accountSkinId가 있으면 정확히 그 구매 스킨의 standing 자산을 반환한다(추측 없음)", () => {
  const purchasedSkinId = "player-skin-경비원1-바이올렛" // GUARD 직업(guard 탭)의 실제 구매 가능 스킨 id
  const self = buildSelf({ role: "GUARD", team: "CITIZEN", accountSkinId: purchasedSkinId })

  const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })

  assert.ok(result)
  assert.equal(result.standingSrc, getSkinCardWearItemById(purchasedSkinId).standingSrc)
  assert.notEqual(
    result.standingSrc,
    getSkinCardWearItemById(getDefaultSkinIdForJob("guard")).standingSrc,
    "구매한 스킨이 있으면 기본 스킨이 아니라 실제 구매한 스킨이 렌더돼야 한다",
  )
})

test("getInGameRoleRevealInfo: self.accountSkinId가 없으면(own-property 자체가 없음, undefined) 그 직업의 기본 스킨으로 대체한다", () => {
  const self = buildSelf({ role: "DOCTOR", team: "CITIZEN" }) // accountSkinId 필드 자체가 없음
  const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })

  assert.ok(result)
  assert.equal(result.standingSrc, getSkinCardWearItemById(getDefaultSkinIdForJob("doctor")).standingSrc)
})

test("getInGameRoleRevealInfo: self.accountSkinId가 명시적으로 null이어도(서버가 own-property를 만들었지만 미장착) 기본 스킨으로 대체한다", () => {
  const self = buildSelf({ role: "WITCH_HUNTER", team: "CITIZEN", accountSkinId: null })
  const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })

  assert.ok(result)
  assert.equal(result.standingSrc, getSkinCardWearItemById(getDefaultSkinIdForJob("witchHunter")).standingSrc)
})

test("getInGameRoleRevealInfo: 각 역할은 그 역할에 대응하는 직업의 기본 스킨을 가리킨다(역할↔직업 매핑이 뒤섞이지 않음)", () => {
  const expectations = [
    ["CITIZEN", "noble"],
    ["JOKER", "clown"],
    ["DOCTOR", "doctor"],
    ["GUARD", "guard"],
    ["WITCH_HUNTER", "witchHunter"],
  ]
  for (const [role, jobId] of expectations) {
    const self = buildSelf({ role, team: role === "JOKER" ? "JOKER" : "CITIZEN", ...(role === "JOKER" ? { allies: [] } : {}) })
    const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })
    assert.ok(result, `role=${role}`)
    assert.equal(result.standingSrc, getSkinCardWearItemById(getDefaultSkinIdForJob(jobId)).standingSrc, `role=${role} → job=${jobId}`)
  }
})

test("getInGameRoleRevealInfo: self 객체에 다른 참가자의 직업별 장착 맵(accountSkinsByJob)이 섞여 있어도 그 필드는 결과에 전혀 나타나지 않는다(비공개 맵 유출 금지)", () => {
  const self = buildSelf({
    role: "CITIZEN",
    team: "CITIZEN",
    accountSkinId: "basic-skin-귀족1",
    accountSkinsByJob: { noble: "player-skin-귀족1-블러드", clown: "player-skin-광대1-테스트" },
  })

  const result = getInGameRoleRevealInfo(self, { authUuid: AUTH_UUID })

  assert.ok(result)
  assert.equal(Object.hasOwn(result, "accountSkinsByJob"), false, "직업별 전체 맵은 view-model에 어떤 키로도 존재하면 안 된다")
  assert.equal(JSON.stringify(result).includes("accountSkinsByJob"), false)
})
