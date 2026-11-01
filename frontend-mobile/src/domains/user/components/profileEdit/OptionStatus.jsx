// 프로필 편집 목록 상태 글 (불러오는 중·실패와 다시 시도·비었음)
// OptionGrid가 씀
import {
  GRID_RETRY_BTN_CLASS,
  GRID_STATUS_TEXT_CLASS,
} from "@/domains/user/constants/profileEditLayout.js"

// 데스크톱 ProfileEditOptionGrid 상태 글과 같은 모양, 다시 시도만 높이 44px
export default function OptionStatus({ status, onRetry, loadingText, errorText, emptyText }) {
  if (status === "loading") {
    return <p className={GRID_STATUS_TEXT_CLASS}>{loadingText}</p>
  }

  if (status === "error") {
    return (
      <div className={GRID_STATUS_TEXT_CLASS}>
        <p>{errorText}</p>
        <button type="button" onClick={() => onRetry()} className={`${GRID_RETRY_BTN_CLASS} min-h-11`}>
          다시 시도
        </button>
      </div>
    )
  }

  return <p className={GRID_STATUS_TEXT_CLASS}>{emptyText}</p>
}
