// 대기방 설정 편집 폼 값·탭·제출 (편집 모드만)
// SettingsEditSheet가 씀, 데스크톱 GameSetupPanel 안 로직(편집 갈래)을 같은 데스크톱 훅으로 다시 묶음
import { useState } from "react"
import { ALL_SETUP_ITEMS, NON_EDITABLE_SETUP_ITEM_IDS } from "@/domains/game/setup/constants/roomSettingsForm.js"
import { mergeSpecifiedRoleTimes } from "@/domains/game/setup/utils/roomSettingsForm/nightTimes.js"
import { useSetupTabState } from "@/domains/game/setup/hooks/useSetupTabState.js"
import { useRoleCompositionState } from "@/domains/game/setup/hooks/useRoleCompositionState.js"
import { useNightTimeEdits } from "@/domains/game/setup/hooks/useNightTimeEdits.js"

// 편집 폼 상태 (initialFormState = useSettingsEdit의 settingsForm, ok일 때만 넘어옴)
export function useSettingsForm({ initialFormState, formResetKey, isSaving, onSubmit }) {
  const [activeTab, setActiveTab] = useState("general")
  const { checks, ranges, setCheck, setRange } = useSetupTabState(ALL_SETUP_ITEMS, {
    initialState: initialFormState,
    resetKey: formResetKey,
  })
  const roleComposition = useRoleCompositionState({
    maxPlayers: ranges["max-players"],
    autoJokerCount: ranges["joker-count"],
    initialComposition: initialFormState?.roleComposition ?? null,
    resetKey: formResetKey,
  })
  // 전체 밤 시간 바꾸면 안 손댄 직업 밤 시간도 맞춤
  const { editedRoleTimeIds, handleSetRange } = useNightTimeEdits({
    ranges, setRange, initialFormState, formResetKey,
  })

  const canSubmit = !isSaving && roleComposition.validation.ok

  // 제출: 편집은 폼 값 그대로 넘김 (데스크톱 편집 모드와 같은 모양)
  const submit = () => {
    if (!canSubmit) return
    onSubmit({
      checks,
      ranges,
      roleComposition: { mode: roleComposition.mode, roleCounts: roleComposition.roleCounts },
      specifiedRoleNightActionTimes: mergeSpecifiedRoleTimes(
        initialFormState?.specifiedRoleNightActionTimes ?? [], editedRoleTimeIds,
      ),
    })
  }

  return {
    activeTab,
    setActiveTab,
    checks,
    ranges,
    setCheck,
    setRange: handleSetRange,
    roleComposition,
    // 방 만든 뒤엔 못 바꾸는 항목 숨김
    hiddenItemIds: NON_EDITABLE_SETUP_ITEM_IDS,
    canSubmit,
    submit,
  }
}
