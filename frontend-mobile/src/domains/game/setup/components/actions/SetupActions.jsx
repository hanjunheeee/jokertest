// 설정 아래 버튼 줄: 만들기(저장) + 편집이면 취소 (데스크톱 GameSetupPanel 아래 버튼 줄과 같은 글·순서)
// SetupPanel이 씀 (배경 위 패널 아래에 그림)
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { ACTION_LOOK } from "../../constants/setupLayout.js"

// 버튼 줄 (만들기 모드는 진행 글자 없이 같은 글자, 데스크톱과 같음)
export default function SetupActions({
  isEditMode, isCreating, canSubmit, submitLabel, submitBusyLabel, onSubmit, onCancel,
}) {
  const label = submitLabel ?? (isEditMode ? "설정 저장" : "게임 만들기")
  const busyLabel = submitBusyLabel ?? (isEditMode ? "저장 중…" : null)

  return (
    <div className="flex shrink-0 items-center justify-center gap-3 pt-1">
      <ImageButton
        look={ACTION_LOOK}
        src={GAME_SETUP_ASSETS.createGameButton}
        label={isCreating && busyLabel ? busyLabel : label}
        ariaLabel={label}
        busy={isCreating}
        disabled={!canSubmit}
        onClick={onSubmit}
      />
      {/* 취소는 닫기 효과음(data-sfx-kind) */}
      {onCancel ? (
        <ImageButton
          look={ACTION_LOOK}
          src={GAME_SETUP_ASSETS.cancelButton}
          label="취소"
          ariaLabel="설정 변경 취소"
          sfxKind="ui-cancel"
          disabled={isCreating}
          onClick={onCancel}
        />
      ) : null}
    </div>
  )
}
