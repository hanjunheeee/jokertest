// 게임 설정 패널: 탭(일반·회의)·설정 본문·만들기(저장)/취소 버튼
// GameSetupPage(만들기)와 대기방 설정 편집(편집 모드)이 씀
import { motion } from "framer-motion"
import { useRef, useState } from "react"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import { ALL_SETUP_ITEMS } from "../constants/roomSettingsForm.js"
import {
  FRAME_OVERLAY_INSET,
  PANEL_CLASS,
  PANEL_WRAP_CLASS,
  SETUP_CONTENT_CLASS,
} from "../constants/gameSetupPanelStyles.js"
import { UI_REVEAL_TRANSITION } from "../../../../shared/constants/pageTransitions.js"
import { useRoleCompositionState } from "../hooks/useRoleCompositionState.js"
import { useSetupContentScrollOnRoleModeChange } from "../hooks/useSetupContentScrollOnRoleModeChange.js"
import { useSetupTabState } from "../hooks/useSetupTabState.js"
import { useNightTimeEdits } from "../hooks/useNightTimeEdits.js"
import { buildCreateRoomPayload } from "../utils/buildCreateRoomPayload.js"
import {
  NON_EDITABLE_SETUP_ITEM_IDS,
  mergeSpecifiedRoleTimes,
} from "../utils/roomSettingsForm.js"
import GameSetupCreateButton from "./GameSetupCreateButton.jsx"
import GameSetupCancelButton from "./GameSetupCancelButton.jsx"
import {
  FORM_ACTIONS_ROW_CLASS,
  FORM_ACTIONS_SINGLE_CLASS,
} from "../constants/gameSetupFormActions.js"
import GameSetupTabs from "./GameSetupTabs.jsx"
import GeneralGameSetupTab from "./GeneralGameSetupTab.jsx"
import MeetingGameSetupTab from "./MeetingGameSetupTab.jsx"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

export default function GameSetupPanel({
  visible,
  isCreating,
  onCreateGame,
  mode = "create",
  initialFormState = null,
  formResetKey = null,
  submitLabel,
  submitBusyLabel,
  submitDisabled = false,
  onCancel = null,
}) {
  const setupContentRef = useRef(null)
  const isEditMode = mode === "edit"
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

  // 직업 구성 방식을 바꾸면 그 구역이 보이게 본문 스크롤
  useSetupContentScrollOnRoleModeChange(setupContentRef, roleComposition.mode, activeTab)

  const { editedRoleTimeIds, handleSetRange } = useNightTimeEdits({
    ranges, setRange, initialFormState, formResetKey,
  })

  // 편집 모드에선 방 만든 뒤 못 바꾸는 항목 숨김
  const hiddenItemIds = isEditMode ? NON_EDITABLE_SETUP_ITEM_IDS : undefined

  // 제출: 편집은 폼 값 그대로, 만들기는 방 만들기 payload로 바꿔서 넘김
  const handleSubmitClick = () => {
    if (!roleComposition.validation.ok) return
    if (isCreating || submitDisabled) return

    const composition = { mode: roleComposition.mode, roleCounts: roleComposition.roleCounts }
    if (isEditMode) {
      onCreateGame({
        checks,
        ranges,
        roleComposition: composition,
        specifiedRoleNightActionTimes: mergeSpecifiedRoleTimes(
          initialFormState?.specifiedRoleNightActionTimes ?? [], editedRoleTimeIds,
        ),
      })
      return
    }
    onCreateGame(
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

  return (
    <div
      className={PANEL_WRAP_CLASS}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <motion.div
        className={PANEL_CLASS}
        initial={{ opacity: 0, y: 12 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={UI_REVEAL_TRANSITION}
      >
        <div className="relative">
          <PublicAsset
            src={GAME_SETUP_ASSETS.frame}
            alt="인게임 설정"
            className="pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_36px_rgba(0,0,0,0.5)]"
          />

          <div
            className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
            style={FRAME_OVERLAY_INSET}
          >
            <GameSetupTabs activeTab={activeTab} onSelect={setActiveTab} />

            <div ref={setupContentRef} className={SETUP_CONTENT_CLASS}>
              {activeTab === "general" ? (
                <GeneralGameSetupTab
                  checks={checks}
                  ranges={ranges}
                  setCheck={setCheck}
                  setRange={handleSetRange}
                  roleComposition={roleComposition}
                  hiddenItemIds={hiddenItemIds}
                />
              ) : (
                <MeetingGameSetupTab
                  checks={checks}
                  ranges={ranges}
                  setCheck={setCheck}
                  setRange={handleSetRange}
                  hiddenItemIds={hiddenItemIds}
                />
              )}
            </div>
          </div>
        </div>

        <div className={onCancel ? FORM_ACTIONS_ROW_CLASS : FORM_ACTIONS_SINGLE_CLASS}>
          <GameSetupCreateButton
            onClick={handleSubmitClick}
            disabled={isCreating || submitDisabled || !roleComposition.validation.ok}
            label={submitLabel ?? (isEditMode ? "설정 저장" : "게임 만들기")}
            busy={isCreating}
            busyLabel={submitBusyLabel ?? (isEditMode ? "저장 중…" : null)}
          />
          {onCancel ? (
            <GameSetupCancelButton
              onClick={onCancel}
              disabled={isCreating}
              ariaLabel="설정 변경 취소"
            />
          ) : null}
        </div>
      </motion.div>
    </div>
  )
}
