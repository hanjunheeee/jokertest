// 방 설정 패널: 탭(일반·회의&투표)·양피지 본문(한 열 스크롤)·아래 버튼 줄, 데스크톱 GameSetupPanel과 같은 구성
// GameSetupPage(만들기)가 씀, 대기방 설정 변경 시트는 모양이 달라 줄 부품(game/shared/settings)만 같이 씀
import { useState } from "react"
import { motion } from "framer-motion"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { GENERAL_GAME_SETUP, MEETING_GAME_SETUP } from "@/domains/game/setup/constants/gameSetupOptions.js"
import { useSetupForm } from "@m/domains/game/shared/hooks/useSetupForm.js"
import RoleComposition from "@m/domains/game/shared/settings/RoleComposition.jsx"
import SettingList from "@m/domains/game/shared/settings/SettingList.jsx"
import { PARCHMENT_STYLE } from "../constants/setupLayout.js"
import SetupTabs from "./SetupTabs.jsx"
import SetupActions from "./actions/SetupActions.jsx"

// 설정 패널 (처음 탭은 일반, 역할 구성은 데스크톱처럼 일반 탭 끝에)
export default function SetupPanel({
  visible = true,
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
  const [activeTab, setActiveTab] = useState("general")
  const form = useSetupForm({
    mode, initialFormState, formResetKey, isCreating, submitDisabled, onSubmit: onCreateGame,
  })

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col gap-2"
      initial={{ opacity: 0, y: 12 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={UI_REVEAL_TRANSITION}
      style={{ pointerEvents: visible ? "auto" : "none" }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 land:flex-row land:gap-3">
        <div className="shrink-0 land:w-44">
          <SetupTabs activeTab={activeTab} onSelect={setActiveTab} />
        </div>

        {/* 탭을 바꾸면 key로 새로 그려서 스크롤을 맨 위로, 내용이 짧으면 종이도 내용만큼 */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            key={activeTab}
            data-setup-content
            className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border-2 border-[#4a3426] px-4 py-1 shadow-[inset_0_0_24px_rgba(60,35,15,0.45),0_8px_24px_rgba(0,0,0,0.5)]"
            style={PARCHMENT_STYLE}
          >
            {activeTab === "general" ? (
              <SettingList
                look="setup"
                items={GENERAL_GAME_SETUP}
                form={form}
                after={<RoleComposition look="setup" roleComposition={form.roleComposition} maxPlayers={form.ranges["max-players"]} />}
              />
            ) : (
              <SettingList look="setup" items={MEETING_GAME_SETUP} form={form} />
            )}
          </div>
        </div>
      </div>

      <SetupActions
        isEditMode={form.isEditMode}
        isCreating={isCreating}
        canSubmit={form.canSubmit}
        submitLabel={submitLabel}
        submitBusyLabel={submitBusyLabel}
        onSubmit={form.submit}
        onCancel={onCancel}
      />
    </motion.div>
  )
}
