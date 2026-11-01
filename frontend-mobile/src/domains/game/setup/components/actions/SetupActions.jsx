// 설정 아래 버튼 줄: 만들기(저장) + 편집이면 취소, 역할 구성이 틀리면 이유 한 줄
// SetupPanel이 씀 (ShellBottom 안이나 패널 아래에 그림)
import ActionButton from "./ActionButton.jsx"

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
        <ActionButton
          label={isCreating && busyLabel ? busyLabel : label}
          ariaLabel={label}
          busy={isCreating}
          disabled={!canSubmit}
          onClick={onSubmit}
        />
        {onCancel ? (
          <ActionButton kind="cancel" label="취소" ariaLabel="설정 변경 취소" disabled={isCreating} onClick={onCancel} />
        ) : null}
      </div>
    </div>
  )
}
