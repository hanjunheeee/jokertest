import { motion } from "framer-motion"
import { useRef, useState } from "react"
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import { GENERAL_GAME_SETUP, MEETING_GAME_SETUP } from "../constants/gameSetupOptions.js"
import { useRoleCompositionState } from "../hooks/useRoleCompositionState.js"
import { useSetupContentScrollOnRoleModeChange } from "../hooks/useSetupContentScrollOnRoleModeChange.js"
import { useSetupTabState } from "../hooks/useSetupTabState.js"
import { buildCreateRoomPayload } from "../utils/buildCreateRoomPayload.js"
import {
  NIGHT_TIME_ID_TO_ROLE,
  NON_EDITABLE_SETUP_ITEM_IDS,
  OVERALL_NIGHT_ACTION_TIME_ID,
  mergeSpecifiedRoleNightActionTimes,
} from "../utils/roomSettingsForm.js"
import GameSetupCreateButton from "./GameSetupCreateButton.jsx"
import GameSetupCancelButton from "./GameSetupCancelButton.jsx"
import {
  GAME_SETUP_FORM_ACTIONS_ROW_CLASS,
  GAME_SETUP_FORM_ACTIONS_SINGLE_CLASS,
} from "../constants/gameSetupFormActions.js"
import GameSetupTabs from "./GameSetupTabs.jsx"
import GeneralGameSetupTab from "./GeneralGameSetupTab.jsx"
import MeetingGameSetupTab from "./MeetingGameSetupTab.jsx"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../../shared/constants/customScrollbarStyles.js"

const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }

const PANEL_WRAP_CLASS =
  "absolute left-1/2 top-[48%] z-20 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.82]"

const PANEL_CLASS =
  "flex w-[min(76rem,96vw)] flex-col items-center"

const FRAME_OVERLAY_INSET = {
  paddingTop: "3.75%",
  paddingBottom: "14%",
  paddingLeft: "9.5%",
  paddingRight: "9.5%",
}

const SETUP_CONTENT_CLASS =
  `flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-clip pt-[clamp(1.35rem,1.85vh,2.5rem)] pb-[clamp(3.25rem,5vh,4.25rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

const ALL_SETUP_ITEMS = [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP]

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

  useSetupContentScrollOnRoleModeChange(setupContentRef, roleComposition.mode, activeTab)

  const [editedRoleTimeIds, setEditedRoleTimeIds] = useState(() => new Set())
  const [appliedFormSource, setAppliedFormSource] = useState({ key: formResetKey, state: initialFormState })
  if (appliedFormSource.key !== formResetKey || appliedFormSource.state !== initialFormState) {
    setAppliedFormSource({ key: formResetKey, state: initialFormState })
    setEditedRoleTimeIds(new Set())
  }

  const handleSetRange = (id, next) => {
    const changed = ranges[id] !== next
    if (NIGHT_TIME_ID_TO_ROLE[id] !== undefined && changed) {
      setEditedRoleTimeIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    }
    setRange(id, next)

    const hasSpecifiedList = Array.isArray(initialFormState?.specifiedRoleNightActionTimes)
    if (!hasSpecifiedList || id !== OVERALL_NIGHT_ACTION_TIME_ID || !changed) return
    const serverSpecified = initialFormState.specifiedRoleNightActionTimes
    for (const [roleTimeId, role] of Object.entries(NIGHT_TIME_ID_TO_ROLE)) {
      if (serverSpecified.includes(role) || editedRoleTimeIds.has(roleTimeId)) continue
      setRange(roleTimeId, next)
    }
  }

  const hiddenItemIds = isEditMode ? NON_EDITABLE_SETUP_ITEM_IDS : undefined

  const handleSubmitClick = () => {
    if (!roleComposition.validation.ok) return
    if (isCreating || submitDisabled) return

    const composition = { mode: roleComposition.mode, roleCounts: roleComposition.roleCounts }
    if (isEditMode) {
      onCreateGame({
        checks,
        ranges,
        roleComposition: composition,
        specifiedRoleNightActionTimes: mergeSpecifiedRoleNightActionTimes(
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
        specifiedRoleNightActionTimes: mergeSpecifiedRoleNightActionTimes(
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
              {activeTab === "general" ? ( // 일반 탭
                <GeneralGameSetupTab
                  checks={checks}
                  ranges={ranges}
                  setCheck={setCheck}
                  setRange={handleSetRange}
                  roleComposition={roleComposition}
                  hiddenItemIds={hiddenItemIds}
                />
              ) : ( // 회의&투표 탭
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

        <div className={onCancel ? GAME_SETUP_FORM_ACTIONS_ROW_CLASS : GAME_SETUP_FORM_ACTIONS_SINGLE_CLASS}>
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
