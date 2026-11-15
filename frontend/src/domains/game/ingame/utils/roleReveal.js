// 직업 공개 화면 정보 만들기와 직업 공개 확인 상태 비우기 (상태를 안 건드리는 순수 계산)
// 직업 공개 훅·직업 공개 창·밤 행동 제출 훅·직업 공개 확인 훅이 사용
import { getRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"
import {
  getDefaultSkinIdForJob,
  getSkinCardWearItemById,
} from "../../../user/constants/skinCardWear/skinCardWearCatalog.js"

// 직업 → 팀 짝 (본인 팀 검사용)
const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}

// 같은 직업 동료가 보이는 직업 (시민은 동료 줄 없음)
const ALLY_VISIBLE_ROLES = new Set(["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"])

// 직업 → 스킨 직업 id (서 있는 그림 찾기용)
const ROLE_TO_SKIN_JOB_ID = {
  CITIZEN: "noble",
  JOKER: "clown",
  DOCTOR: "doctor",
  GUARD: "guard",
  WITCH_HUNTER: "witchHunter",
}

// 직업 서 있는 그림: 계정 스킨, 없으면 그 직업 기본 스킨
function resolveStandingSrc(role, accountSkinId) {
  const skinJobId = ROLE_TO_SKIN_JOB_ID[role]
  if (!skinJobId) return null
  const resolvedSkinId = accountSkinId ?? getDefaultSkinIdForJob(skinJobId)
  if (!resolvedSkinId) return null
  return getSkinCardWearItemById(resolvedSkinId)?.standingSrc ?? null
}

// 빈칸 아닌 글자인지
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

// 내 판 정보가 맞을 때만 직업 공개 화면 값 (시민 아니면 같은 직업 동료 목록 포함)
export function getInGameRoleRevealInfo(self, { authUuid } = {}) {
  if (self === null || typeof self !== "object" || Array.isArray(self)) return null
  if (!isNonEmptyString(authUuid)) return null
  if (self.uuid !== authUuid) return null
  if (!isNonEmptyString(self.nickname)) return null
  if (!Object.hasOwn(ROLE_TEAMS, self.role)) return null
  if (self.team !== ROLE_TEAMS[self.role]) return null

  const display = getRoleRevealDisplay(self.role)
  if (!display) return null

  // 시민 아니면 동료 목록 (혼자면 빈 목록), 광대만 꼭 있어야 함
  // 의사·경비원·마녀사냥꾼은 목록이 없으면 동료 없음으로 봄 (옛 서버 값이 섞여도 직업 공개가 안 빠지게), 있는데 배열이 아니면 거절
  let allies = null
  if (ALLY_VISIBLE_ROLES.has(self.role)) {
    const hasAllies = Object.hasOwn(self, "allies") && self.allies !== undefined
    if (!hasAllies && self.role === "JOKER") return null
    if (hasAllies && !Array.isArray(self.allies)) return null
    allies = hasAllies ? [...self.allies] : []
  }

  return {
    uuid: self.uuid,
    nickname: self.nickname,
    role: self.role,
    roleName: display.name,
    teamLabel: display.teamLabel,
    description: display.description,
    allies,
    standingSrc: resolveStandingSrc(self.role, self.accountSkinId ?? null),
  }
}

// 동료 uuid를 지금 판 참가자 닉네임과 짝지음 (판에 없는 uuid는 뺌)
export function resolveInGameRoleRevealAllies(allyUuids, players) {
  if (!Array.isArray(allyUuids) || allyUuids.length === 0) return []
  if (!Array.isArray(players)) return []

  const nicknameByUuid = new Map(players.map((player) => [player.uuid, player.nickname]))

  return allyUuids
    .filter((uuid) => nicknameByUuid.has(uuid))
    .map((uuid) => ({ uuid, nickname: nicknameByUuid.get(uuid) }))
}

// 판·소켓이 바뀌어 직업 공개 확인을 버릴 때 상태 조각 (화면이 없으면 null)
export function computeRoleRevealInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null }
}
