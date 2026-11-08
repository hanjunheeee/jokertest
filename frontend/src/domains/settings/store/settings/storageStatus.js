// 설정 기기 저장 실패 표시 (FE-037)
// 설정 스토어 입구가 실패·회복 때 바꾸고, 설정 창(SettingPanel)이 안내 줄로 보임
// 설정 스토어 안에 두면 바꿀 때마다 persist가 다시 저장해 실패 기록을 지워 버려 따로 둠
import { create } from "zustand"

export const useSettingsStorageStatus = create(() => ({ writeFailed: false }))
