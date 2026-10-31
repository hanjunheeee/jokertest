import { ROLE_COMPOSITION_MODES } from "../constants/roleComposition.js"
import { NEXT_ROOM_SETTINGS_RESTORE_CODES } from "../store/nextRoomSettingsStore.js"
import { buildCreateRoomPayload } from "./buildCreateRoomPayload.js"
import { buildDefaultSetupFormState, buildRoomSettingsFormState } from "./roomSettingsForm.js"

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
