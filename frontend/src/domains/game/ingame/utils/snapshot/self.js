// 스냅샷 본인 정보 검사와 새 본인 정보 만들기 (순수 계산)
// utils/snapshot/applySnapshot.js가 사용
import { ROLE_TEAMS } from "../../constants/store/sessionSnapshot.js"
import { SELF_SUBMISSION_KEYS } from "../../constants/store/ingameStore.js"
import { BAD, isNonEmptyString, isPlainObject } from "./checks.js"

// 조커 동료 목록 검사 (본인·명단 밖·중복이면 BAD), 조커가 아닌데 목록이 오면 BAD
function readAllies(self, roster) {
  if (self.role !== "JOKER") return Object.hasOwn(self, "allies") ? BAD : null
  if (!Object.hasOwn(self, "allies")) return BAD
  if (!Array.isArray(self.allies)) return BAD
  const seen = new Set()
  for (const allyUuid of self.allies) {
    if (typeof allyUuid !== "string" || allyUuid.length === 0) return BAD
    if (allyUuid === self.uuid) return BAD
    if (!roster.has(allyUuid)) return BAD
    if (seen.has(allyUuid)) return BAD
    seen.add(allyUuid)
  }
  return [...self.allies]
}

// 본인 정보 검사: 역할·팀 짝, 지금 본인과 같은 사람, 명단 별명과 같음 → 동료 목록 (틀리면 BAD)
export function readSelf(self, roster, currentSelfUuid) {
  if (!isPlainObject(self)) return BAD
  if (!isNonEmptyString(self.uuid)) return BAD
  if (!isNonEmptyString(self.nickname)) return BAD
  if (!Object.hasOwn(ROLE_TEAMS, self.role)) return BAD
  if (self.team !== ROLE_TEAMS[self.role]) return BAD
  if (Object.hasOwn(self, "accountSkinId") && self.accountSkinId !== null && !isNonEmptyString(self.accountSkinId)) return BAD
  if (typeof self.hasActedThisPhase !== "boolean") return BAD
  if (!roster.has(self.uuid)) return BAD
  if (self.uuid !== currentSelfUuid) return BAD
  if (roster.get(self.uuid).nickname !== self.nickname) return BAD
  return readAllies(self, roster)
}

// 제출 상태 키 중 온 것만 복사
function copySubmissionFields(self) {
  const fields = {}
  for (const key of SELF_SUBMISSION_KEYS) {
    if (Object.hasOwn(self, key)) fields[key] = self[key]
  }
  return fields
}

// 새 본인 정보 만들기 (조커일 때만 동료 목록 넣음)
export function buildSelf(self, allies) {
  return {
    uuid: self.uuid,
    nickname: self.nickname,
    role: self.role,
    team: self.team,
    hasActedThisPhase: self.hasActedThisPhase,
    ...(Object.hasOwn(self, "accountSkinId") ? { accountSkinId: self.accountSkinId } : {}),
    ...copySubmissionFields(self),
    ...(self.role === "JOKER" ? { allies } : {}),
  }
}
