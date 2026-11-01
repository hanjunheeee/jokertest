// 설정 아래 버튼 줄: 만들기(저장) + 편집이면 취소, 역할 구성이 틀리면 이유 한 줄
// SetupPanel이 씀 (ShellBottom 안이나 패널 아래에 그림)
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"

// 그림 버튼 (수락 그림 = 만들기·저장, 취소 그림 = 취소), 누를 때 그림만 줄어듦
const ACTION_LOOK = {
  button: "group relative block w-full max-w-60 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-60",
  img: "block h-14 w-full select-none object-fill transition-transform group-active:scale-[0.97] land:h-11",
  label: "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:1.1rem] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]",
}

// 버튼 줄 (역할 탭 밖에서도 만들기가 왜 막혔는지 보이게 오류를 버튼 위에 띄움)
export default function SetupActions({
  isEditMode, isCreating, canSubmit, error, submitLabel, submitBusyLabel, onSubmit, onCancel,
}) {
  const label = submitLabel ?? (isEditMode ? "설정 저장" : "게임 만들기")
  const busyLabel = submitBusyLabel ?? (isEditMode ? "저장 중…" : null)

  return (
    <div className="flex flex-col items-center gap-1.5 bg-gradient-to-t from-black via-black/90 to-black/60 px-4 pb-3 pt-2 land:pb-2 land:pt-1">
      {error ? (
        <p className="text-center font-subheading app-text-scaled [--app-text-size:0.85rem] font-semibold text-[#ffb3a7]">
          {error}
        </p>
      ) : null}
      <div className="flex w-full items-center justify-center gap-3">
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
    </div>
  )
}
