import { getInGameRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"

// buildPlayerSessionSourceFromGameState.js·applySessionSnapshot.js와 동일한 role/team 화이트리스트
// (백엔드 game-core ROLE_DEFINITIONS의 수동 동기화 사본).
const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * 인게임 store의 self(비밀 역할 정보)와 인증된 계정 uuid로부터 역할 공개 오버레이가 표시할
 * 정보를 계산하는 순수 함수. self가 "지금 로그인한 나"의 것이 아니면(uuid 불일치) 이전 계정·
 * 이전 게임의 잔여 데이터로 보고 null을 반환한다 — 다른 참가자의 비밀 정보를 절대 만들어내지
 * 않는다는 계약과 동일한 이유다. allies는 self.role이 JOKER이고 self.allies가 배열일 때만
 * 그대로 노출하고, 그 외에는 항상 null이다(비-JOKER는 payload에 allies가 섞여 들어와도 절대
 * 노출하지 않는다).
 */
export function getInGameRoleRevealInfo(self, { authUuid } = {}) {
  if (self === null || typeof self !== "object" || Array.isArray(self)) return null
  if (!isNonEmptyString(authUuid)) return null
  if (self.uuid !== authUuid) return null
  if (!isNonEmptyString(self.nickname)) return null
  if (!Object.hasOwn(ROLE_TEAMS, self.role)) return null
  if (self.team !== ROLE_TEAMS[self.role]) return null

  const display = getInGameRoleRevealDisplay(self.role)
  if (!display) return null

  let allies = null
  if (self.role === "JOKER") {
    if (!Array.isArray(self.allies)) return null
    allies = [...self.allies]
  }

  return {
    uuid: self.uuid,
    nickname: self.nickname,
    role: self.role,
    roleName: display.name,
    teamLabel: display.teamLabel,
    description: display.description,
    allies,
  }
}
