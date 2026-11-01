// 직업별 밤 시간: 서버가 따로 정한 직업 목록 합치기, 요청에 실을 값 모으기
// updatePayload·buildCreateRoomPayload·GameSetupPanel(입구 거쳐)이 씀
import { ROLE_NIGHT_ACTION_TIME_OPTIONS } from "../../constants/gameSetupOptions.js"
import { ROLE_TO_NIGHT_TIME_ID } from "../../constants/roomSettingsForm.js"

// 서버가 따로 정한 직업 + 이번에 손댄 직업 (서버 목록이 없으면 undefined)
export function mergeSpecifiedRoleTimes(serverSpecified, editedRoleTimeIds) {
  if (!Array.isArray(serverSpecified)) return undefined
  return ROLE_NIGHT_ACTION_TIME_OPTIONS
    .filter(({ role, id }) => serverSpecified.includes(role) || editedRoleTimeIds?.has?.(id) === true)
    .map(({ role }) => role)
}

// 요청에 실을 직업별 밤 시간: 목록이 있으면 그 직업만, 없으면 폼에 있는 직업 전부, 하나도 없으면 null
export function collectSpecifiedRoleTimes(ranges, specified) {
  const roleNightActionTimes = {}
  if (Array.isArray(specified)) {
    for (const role of specified) {
      const id = ROLE_TO_NIGHT_TIME_ID[role]
      if (id === undefined) continue
      if (!Object.hasOwn(ranges ?? {}, id)) continue
      roleNightActionTimes[role] = ranges[id]
    }
  } else {
    for (const { role, id } of ROLE_NIGHT_ACTION_TIME_OPTIONS) {
      if (!Object.hasOwn(ranges ?? {}, id)) continue
      roleNightActionTimes[role] = ranges[id]
    }
  }
  return Object.keys(roleNightActionTimes).length > 0 ? roleNightActionTimes : null
}
