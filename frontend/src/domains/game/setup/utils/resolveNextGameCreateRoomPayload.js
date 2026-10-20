/**
 * F-24: "다음 게임 동일 설정 유지" 저장값(또는 해제 시 기본값)을 create_room payload로 바꾼다.
 * React/Socket에 의존하지 않는 순수 함수다 — 결과 화면·게임 만들기 화면이 같은 규칙을 쓴다.
 */
import { ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import { NEXT_ROOM_SETTINGS_RESTORE_CODES } from "../store/nextRoomSettingsStore.js"
import { buildCreateRoomPayload } from "./buildCreateRoomPayload.js"
import { buildDefaultSetupFormState, buildRoomSettingsFormState } from "./roomSettingsForm.js"

/**
 * @param {string} accountId
 * @param {(accountId: string) => {code: string, source: object|null}} readRestoreSource
 * @returns {object} create_room emit payload
 */
export function resolveNextGameCreateRoomPayload(accountId, readRestoreSource) {
  const read = readRestoreSource(accountId)

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

  const { checks, ranges } = buildDefaultSetupFormState()
  return buildCreateRoomPayload({
    checks,
    ranges,
    roleComposition: { mode: ROLE_COMPOSITION_MODES.AUTO, roleCounts: null },
  })
}
