// 설정 기본값 만들기 (음량·일반 체크)
// 설정 스토어 처음 상태·초기화와 저장값 정리가 씀, 부를 때마다 새 객체를 줌
import { SOUND_SETTING_VOLUMES } from "../../../shared/constants/soundSettings.js"
import { GENERAL_SETTING_CHECKBOXES } from "../constants/generalSettings.js"
import { HIDDEN_GENERAL_CHECK_IDS } from "../constants/settingsStorage.js"

// 음량 id → 기본 음량
export function defaultVolumes() {
  return Object.fromEntries(
    SOUND_SETTING_VOLUMES.map(({ id, defaultValue }) => [id, defaultValue]),
  )
}

// 숨긴 항목을 뺀 일반 체크 id → 기본 체크 여부
export function defaultGeneralChecks() {
  return Object.fromEntries(
    GENERAL_SETTING_CHECKBOXES.filter(({ id }) => !HIDDEN_GENERAL_CHECK_IDS.has(id)).map(
      ({ id, defaultChecked }) => [id, defaultChecked],
    ),
  )
}
