// 방 설정 패널: 탭·양피지 본문(한 열 스크롤)·아래 버튼 줄
// GameSetupPage(만들기)가 씀, 대기방 설정 편집도 mode="edit"·onCancel로 같은 props를 넘겨 쓸 수 있음
import { useState } from "react"
import { motion } from "framer-motion"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { PARCHMENT_STYLE } from "../constants/setupLayout.js"
import { useSetupForm } from "../hooks/useSetupForm.js"
import SetupTabs from "./SetupTabs.jsx"
import GeneralTab from "./tabs/GeneralTab.jsx"
import MeetingTab from "./tabs/MeetingTab.jsx"
import RolesTab from "./tabs/RolesTab.jsx"
import SetupActions from "./actions/SetupActions.jsx"

// 설정 패널 (pinActions면 버튼 줄을 화면 틀 바닥에, 아니면 패널 아래에)
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
  pinActions = true,
}) {
  const [activeTab, setActiveTab] = useState("general")
  const form = useSetupForm({
    mode, initialFormState, formResetKey, isCreating, submitDisabled, onSubmit: onCreateGame,
  })
  const { validation } = form.roleComposition

  const actions = (
    <SetupActions
      isEditMode={form.isEditMode}
      isCreating={isCreating}
      canSubmit={form.canSubmit}
      error={validation.ok || activeTab === "roles" ? null : validation.message}
      submitLabel={submitLabel}
      submitBusyLabel={submitBusyLabel}
      onSubmit={form.submit}
      onCancel={onCancel}
    />
  )

  return (
    <>
      <motion.div
        className="flex min-h-0 flex-1 flex-col gap-2 land:flex-row land:gap-3"
        initial={{ opacity: 0, y: 12 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={UI_REVEAL_TRANSITION}
        style={{ pointerEvents: visible ? "auto" : "none" }}
      >
        <div className="shrink-0 land:w-36">
          <SetupTabs activeTab={activeTab} onSelect={setActiveTab} />
        </div>

        {/* 탭을 바꾸면 key로 새로 그려서 스크롤을 맨 위로, 내용이 짧으면 종이도 내용만큼 */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            key={activeTab}
            role="tabpanel"
            className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border-2 border-[#4a3426] px-4 py-1 shadow-[inset_0_0_24px_rgba(60,35,15,0.45),0_8px_24px_rgba(0,0,0,0.5)]"
            style={PARCHMENT_STYLE}
          >
            {activeTab === "general" ? <GeneralTab form={form} /> : null}
            {activeTab === "meeting" ? <MeetingTab form={form} /> : null}
            {activeTab === "roles" ? (
              <RolesTab roleComposition={form.roleComposition} maxPlayers={form.ranges["max-players"]} />
            ) : null}
          </div>
        </div>
      </motion.div>

      {pinActions ? <ShellBottom>{actions}</ShellBottom> : actions}
    </>
  )
}
