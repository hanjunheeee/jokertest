import { getRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"
import { getDefaultSkinIdForJob, getSkinCardWearItemById } from "../../../user/constants/skinCardWear/skinCardWearCatalog.js"

const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}

const ROLE_TO_SKIN_JOB_ID = {
  CITIZEN: "noble",
  JOKER: "clown",
  DOCTOR: "doctor",
  GUARD: "guard",
  WITCH_HUNTER: "witchHunter",
}

function resolveStandingSrc(role, accountSkinId) {
  const skinJobId = ROLE_TO_SKIN_JOB_ID[role]
  if (!skinJobId) return null
  const resolvedSkinId = accountSkinId ?? getDefaultSkinIdForJob(skinJobId)
  if (!resolvedSkinId) return null
  return getSkinCardWearItemById(resolvedSkinId)?.standingSrc ?? null
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

export function getInGameRoleRevealInfo(self, { authUuid } = {}) {
  if (self === null || typeof self !== "object" || Array.isArray(self)) return null
  if (!isNonEmptyString(authUuid)) return null
  if (self.uuid !== authUuid) return null
  if (!isNonEmptyString(self.nickname)) return null
  if (!Object.hasOwn(ROLE_TEAMS, self.role)) return null
  if (self.team !== ROLE_TEAMS[self.role]) return null

  const display = getRoleRevealDisplay(self.role)
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
    standingSrc: resolveStandingSrc(self.role, self.accountSkinId ?? null),
  }
}
