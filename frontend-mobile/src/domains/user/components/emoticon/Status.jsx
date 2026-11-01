// 이모티콘 화면 안내 줄 (불러오는 중·불러오기 실패와 다시 시도·버전 충돌·저장 실패)
// EmoticonPalettePage가 씀
import {
  CONFLICT_CLASS,
  ERROR_ROW_CLASS,
  NOTICE_ERROR_CLASS,
  RETRY_BTN_CLASS,
  STATUS_CLASS,
  STATUS_WRAP_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"

// 데스크톱 EmoticonPaletteStatus와 같은 문구·모양, 다시 시도만 높이 44px
export default function Status({ status, conflict, notice, onRetry }) {
  if (status !== "loading" && status !== "error" && !conflict && !notice) return null

  return (
    <div className={`${STATUS_WRAP_CLASS} px-4 pb-1`}>
      {status === "loading" ? (
        <p role="status" className={STATUS_CLASS}>이모티콘 팔레트를 불러오는 중입니다.</p>
      ) : null}

      {status === "error" ? (
        <div role="alert" className={ERROR_ROW_CLASS}>
          <span className={STATUS_CLASS}>이모티콘 팔레트를 불러오지 못했습니다.</span>
          <button type="button" onClick={() => onRetry()} className={`${RETRY_BTN_CLASS} min-h-11`}>
            다시 시도
          </button>
        </div>
      ) : null}

      {conflict ? (
        <p role="status" className={`${STATUS_CLASS} ${CONFLICT_CLASS}`}>
          팔레트가 다른 곳에서 먼저 변경되어 최신 값을 불러왔습니다. 확인한 뒤 다시 저장해 주세요.
        </p>
      ) : null}

      {notice ? (
        <p role="alert" className={`${STATUS_CLASS} ${NOTICE_ERROR_CLASS}`}>{notice.text}</p>
      ) : null}
    </div>
  )
}
