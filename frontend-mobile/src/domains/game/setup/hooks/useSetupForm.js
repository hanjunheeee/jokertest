// 방 설정 폼 값·제출 (데스크톱 GameSetupPanel 안에 있던 계산을 그대로 옮김)
// components/SetupPanel이 씀, 만들기(create)·편집(edit) 두 방식
import { useMemo } from "react"
import { ALL_SETUP_ITEMS } from "@/domains/game/setup/constants/roomSettingsForm.js"
import { useSetupTabState } from "@/domains/game/setup/hooks/useSetupTabState.js"
import { useRoleCompositionState } from "@/domains/game/setup/hooks/useRoleCompositionState.js"
import { useNightTimeEdits } from "@/domains/game/setup/hooks/useNightTimeEdits.js"
import { buildCreateRoomPayload } from "@/domains/game/setup/utils/buildCreateRoomPayload.js"
import {
  NON_EDITABLE_SETUP_ITEM_IDS,
  mergeSpecifiedRoleTimes,
} from "@/domains/game/setup/utils/roomSettingsForm.js"

// 폼 상태·숨길 항목·제출 동작
export function useSetupForm({ mode, initialFormState, formResetKey, isCreating, submitDisabled, onSubmit }) {
  const isEditMode = mode === "edit"
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
  const { editedRoleTimeIds, handleSetRange } = useNightTimeEdits({
    ranges, setRange, initialFormState, formResetKey,
  })

  // 편집 모드면 방 만든 뒤 못 바꾸는 항목, 직접 지정이면 광대 수 줄 숨김 (데스크톱과 같음)
  const hiddenIds = useMemo(() => {
    const hidden = new Set(isEditMode ? NON_EDITABLE_SETUP_ITEM_IDS : [])
    if (roleComposition.isCustom) hidden.add("joker-count")
    return hidden
  }, [isEditMode, roleComposition.isCustom])

  const canSubmit = roleComposition.validation.ok && !isCreating && !submitDisabled

  // 제출: 편집은 폼 값 그대로, 만들기는 방 만들기 payload로 바꿔서 넘김
  const submit = () => {
    if (!canSubmit) return
    const composition = { mode: roleComposition.mode, roleCounts: roleComposition.roleCounts }
    if (isEditMode) {
      onSubmit({
        checks,
        ranges,
        roleComposition: composition,
        specifiedRoleNightActionTimes: mergeSpecifiedRoleTimes(
          initialFormState?.specifiedRoleNightActionTimes ?? [], editedRoleTimeIds,
        ),
      })
      return
    }
    onSubmit(
      buildCreateRoomPayload({
        checks,
        ranges,
        roleComposition: composition,
        specifiedRoleNightActionTimes: mergeSpecifiedRoleTimes(
          initialFormState?.specifiedRoleNightActionTimes, editedRoleTimeIds,
        ),
      }),
    )
  }

  return {
    isEditMode,
    checks,
    ranges,
    setCheck,
    setRange: handleSetRange,
    roleComposition,
    hiddenIds,
    canSubmit,
    submit,
  }
}
