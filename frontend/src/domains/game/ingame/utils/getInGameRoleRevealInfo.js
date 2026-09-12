import { getInGameRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"
import { getDefaultSkinIdForJob, getSkinCardWearItemById } from "../../../user/constants/skinCardWear/skinCardWearCatalog.js"

// buildPlayerSessionSourceFromGameState.js·applySessionSnapshot.js와 동일한 role/team 화이트리스트
// (백엔드 game-core ROLE_DEFINITIONS의 수동 동기화 사본).
const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}

// F-14(AC-01/AC-04, R-IMPL P1 수정): 서버 역할 ↔ frontend skinCardWearCatalog.js의 직업별
// 장착 스킨 탭(noble/clown/guard/doctor/witchHunter) 대응표 — backend/game-core/gameSession.js
// ROLE_TO_SKIN_JOB_ID와 정확히 같은 매핑이다(공유 모듈이 없는 이 저장소의 관례대로 각
// 런타임이 독립적으로 든다). self.accountSkinId는 buildViewerRoleFields가 뷰어 자신의 실제
// role에 대응하는 값 하나만(own-property로 있을 때만) 실어 보낸다 — 다른 참가자·다른 직업의
// 선택은 이 payload에 애초에 존재하지 않는다.
const ROLE_TO_SKIN_JOB_ID = {
  CITIZEN: "noble",
  JOKER: "clown",
  DOCTOR: "doctor",
  GUARD: "guard",
  WITCH_HUNTER: "witchHunter",
}

/** self.role에 대응하는 직업 스킨 standing 자산 경로. self.accountSkinId가 없으면(아직
 *  그 직업을 한 번도 장착한 적 없는 계정, 또는 서버가 아직 이 필드를 보장하지 않는 낡은
 *  payload) 그 직업의 기본 스킨으로 대체한다 — SkinCardWearOverlay를 연 적이 없어도 항상
 *  값이 있는 초상을 보여준다(skinCardWear.store.js의 기본값 대체와 동일한 관례). 대응하는
 *  직업이 없거나(알 수 없는 role) 카탈로그에서 id를 찾지 못하면 null이다. */
function resolveInGameRoleRevealStandingSrc(role, accountSkinId) {
  const skinJobId = ROLE_TO_SKIN_JOB_ID[role]
  if (!skinJobId) return null
  const resolvedSkinId = accountSkinId ?? getDefaultSkinIdForJob(skinJobId)
  if (!resolvedSkinId) return null
  return getSkinCardWearItemById(resolvedSkinId)?.standingSrc ?? null
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
    standingSrc: resolveInGameRoleRevealStandingSrc(self.role, self.accountSkinId ?? null),
  }
}
