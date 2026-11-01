// 대기방 설정 편집 화면: 어두운 바탕 위에 게임 설정 패널(편집 모드) + 저장 실패 문구
// GameMatchingPage가 씀, 편집 패널이 열렸을 때만 그림
import GameSetupPanel from "@/domains/game/setup/components/GameSetupPanel.jsx"

export default function SettingsEditOverlay({
  settingsForm,
  formResetKey,
  isSaving,
  onSubmit,
  onCancel,
  settingsError,
  hasPendingSettingsResult,
}) {
  return (
    <div className="absolute inset-0 z-40 bg-black/70">
      <GameSetupPanel
        visible
        mode="edit"
        initialFormState={settingsForm.ok ? settingsForm : null}
        formResetKey={formResetKey}
        isCreating={isSaving}
        onCreateGame={onSubmit}
        onCancel={onCancel}
      />
      {/* 결과 확인 대기 중엔 아래쪽 안내가 같은 오류를 보여 주므로 여기선 숨김 */}
      {settingsError && !hasPendingSettingsResult ? (
        <p role="alert" className="absolute bottom-8 left-1/2 z-50 -translate-x-1/2 text-[#ffd9d9]">
          {settingsError.message ?? "설정을 저장하지 못했습니다."}
        </p>
      ) : null}
    </div>
  )
}
