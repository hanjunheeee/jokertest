// 대기방 설정 변경 시트 (거의 꽉 찬 양피지 시트): 탭·설정 줄·저장/취소·저장 실패 문구
// GameMatchingPage가 씀, 데스크톱 SettingsEditOverlay(GameSetupPanel 편집 모드)를 세로 시트로 바꿈
import { useState } from "react"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { useSetupForm } from "@m/domains/game/shared/hooks/useSetupForm.js"
import BottomSheet from "../sheet/BottomSheet.jsx"
import SettingsTabs from "./SettingsTabs.jsx"
import SettingsItemList from "./SettingsItemList.jsx"
import { ERROR_ON_PARCHMENT_CLASS } from "../../constants/matchingMobileStyles.js"

// 설정 변경 시트 (열렸을 때만 페이지가 그림, 폼 값은 열 때마다 방 설정에서 새로 채움)
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

  return (
    <BottomSheet
      open
      onClose={onCancel}
      title="방 설정 변경"
      tone="parchment"
      size="full"
      closeLabel="설정 변경 취소"
      closeDisabled={isSaving}
      footer={
        <div className="flex flex-col gap-1.5">
          {showError ? (
            <p role="alert" className={`${ERROR_ON_PARCHMENT_CLASS} text-center`}>
              {settingsError.message ?? "설정을 저장하지 못했습니다."}
            </p>
          ) : null}
          <div className="mx-auto grid w-full max-w-[24rem] grid-cols-2 gap-2">
            <ImageButton
              look="fill"
              label={isSaving ? "저장 중…" : "설정 저장"}
              ariaLabel="설정 저장"
              busy={isSaving}
              src={GAME_SETUP_ASSETS.createGameButton}
              onClick={form.submit}
              disabled={!form.canSubmit}
              className="h-12"
            />
            <ImageButton
              look="fill"
              label="취소"
              ariaLabel="설정 변경 취소"
              src={GAME_SETUP_ASSETS.cancelButton}
              sfxKind="ui-cancel"
              onClick={onCancel}
              disabled={isSaving}
              className="h-12"
            />
          </div>
        </div>
      }
    >
      <div className="sticky top-0 z-[1] -mx-4 bg-[#cdb68a] px-4 pt-1 pb-2">
        <SettingsTabs activeTab={activeTab} onSelect={setActiveTab} />
      </div>
      <SettingsItemList activeTab={activeTab} form={form} />
    </BottomSheet>
  )
}
