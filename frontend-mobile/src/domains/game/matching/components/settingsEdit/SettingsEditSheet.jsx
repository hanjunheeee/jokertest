// 대기방 설정 변경 화면: 어두운 덮개 위 탭·양피지 설정 목록·설정 저장/취소 + 저장 실패 글
// GameMatchingPage가 열렸을 때만 씀, 데스크톱 SettingsEditOverlay(GameSetupPanel 편집 모드)와 같은 구성·글
import { useState } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { useSetupForm } from "@m/domains/game/shared/hooks/useSetupForm.js"
import SettingsTabs from "./SettingsTabs.jsx"
import SettingsItemList from "./SettingsItemList.jsx"
import { ACTION_LOOK } from "../../constants/settingsEditStyle.js"

// 설정 변경 화면 (폼 값은 열 때마다 방 설정에서 새로 채움), 처음 탭은 일반
export default function SettingsEditSheet({
  settingsForm,
  formResetKey,
  isSaving,
  onSubmit,
  onCancel,
  settingsError,
  hasPendingSettingsResult,
}) {
  const [activeTab, setActiveTab] = useState("general")
  // 편집 모드: 저장 중이면 잠금, 방 만든 뒤 못 바꾸는 항목 숨김 (방 설정 화면과 같은 훅)
  const form = useSetupForm({
    mode: "edit",
    initialFormState: settingsForm?.ok ? settingsForm : null,
    formResetKey,
    isCreating: isSaving,
    onSubmit,
  })

  // 결과 확인 대기 중엔 바닥 안내가 같은 오류를 보여 주므로 여기선 숨김
  const showError = Boolean(settingsError) && !hasPendingSettingsResult

  // 화면 틀(container) 밖 body에 띄워 바닥 줄까지 덮음
  return createPortal(
    <div className="fixed inset-0 z-[62] bg-black/70">
      <motion.div
        className="mx-auto flex h-full w-full max-w-2xl flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] land:max-w-none land:px-4 land:pt-2 land:pb-2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={UI_REVEAL_TRANSITION}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2 land:flex-row land:gap-3">
          <div className="shrink-0 land:w-44">
            <SettingsTabs activeTab={activeTab} onSelect={setActiveTab} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <SettingsItemList activeTab={activeTab} form={form} />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-3 pt-1">
          <ImageButton
            look={ACTION_LOOK}
            src={GAME_SETUP_ASSETS.createGameButton}
            label={isSaving ? "저장 중…" : "설정 저장"}
            ariaLabel="설정 저장"
            busy={isSaving}
            disabled={!form.canSubmit}
            onClick={form.submit}
          />
          <ImageButton
            look={ACTION_LOOK}
            src={GAME_SETUP_ASSETS.cancelButton}
            label="취소"
            ariaLabel="설정 변경 취소"
            sfxKind="ui-cancel"
            disabled={isSaving}
            onClick={onCancel}
          />
        </div>

        {showError ? (
          <p role="alert" className="shrink-0 text-center text-[#ffd9d9]">
            {settingsError.message ?? "설정을 저장하지 못했습니다."}
          </p>
        ) : null}
      </motion.div>
    </div>,
    document.body,
  )
}
