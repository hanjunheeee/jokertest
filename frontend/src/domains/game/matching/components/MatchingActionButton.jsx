// 대기방 아래쪽 버튼 하나 (준비·시작·삭제·나가기)
// MatchingPopupPanel이 씀, 글자는 그림 위에 겹쳐 보이고 읽기 프로그램에는 aria-label로 알림
import {
  ACTION_BTN_CLASS,
  ACTION_BTN_LABEL_CLASS,
  BTN_SCALE_WRAP_CLASS,
} from "../../../../shared/constants/matchingPopupStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 그림 버튼 하나
export default function MatchingActionButton({ label, src, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={ACTION_BTN_CLASS}
    >
      <span className={BTN_SCALE_WRAP_CLASS}>
        <PublicAsset
          src={src}
          alt=""
          className="block h-auto w-full select-none"
        />
        <span className={ACTION_BTN_LABEL_CLASS} aria-hidden="true">
          {label}
        </span>
      </span>
    </button>
  )
}
