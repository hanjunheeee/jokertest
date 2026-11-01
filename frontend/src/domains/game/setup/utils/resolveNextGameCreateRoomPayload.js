// 결과 화면 방장이 다음 판 방 만들 때 payload: 유지한 설정 있으면 그 값, 없으면 기본값
// result/useGameResultReturnToMatching이 씀, 시험도 씀
import { ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import { NEXT_ROOM_SETTINGS_RESTORE_CODES } from "../store/nextRoomSettingsStore.js"
import { buildCreateRoomPayload } from "./buildCreateRoomPayload.js"
import { buildDefaultFormState, buildRoomSettingsFormState } from "./roomSettingsForm/formState.js"

// 다음 판 방 만들기 payload
export function resolveNextGameCreateRoomPayload(accountId, readRestoreSource) {
  const read = readRestoreSource(accountId)

  // 복원됨(정리값 다시 쓰기 실패 포함)이고 폼으로 바뀌면 그 값
  if (read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.RESTORED
    || read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.SANITIZE_WRITE_FAILED) {
    const form = buildRoomSettingsFormState(read.source)
    if (form.ok) {
      return buildCreateRoomPayload({
        checks: form.checks,
        ranges: form.ranges,
        roleComposition: form.roleComposition,
        specifiedRoleNightActionTimes: form.specifiedRoleNightActionTimes,
      })
    }
  }

  // 그 밖엔 기본값 + 자동 구성
  const { checks, ranges } = buildDefaultFormState()
  return buildCreateRoomPayload({
    checks,
    ranges,
    roleComposition: { mode: ROLE_COMPOSITION_MODES.AUTO, roleCounts: null },
  })
}
