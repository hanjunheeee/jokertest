// 이모티콘 팔레트 화면 위쪽 안내 줄 (불러오는 중·불러오기 실패와 다시 시도·버전 충돌·저장 실패)
// EmoticonPalettePage가 씀
import {
  EMOTICON_PALETTE_CONFLICT_CLASS,
  EMOTICON_PALETTE_ERROR_ROW_CLASS,
  EMOTICON_PALETTE_NOTICE_ERROR_CLASS,
  EMOTICON_PALETTE_RETRY_BTN_CLASS,
  EMOTICON_PALETTE_STATUS_CLASS,
  EMOTICON_PALETTE_STATUS_WRAP_CLASS,
} from "@/domains/user/constants/emoticonPaletteLayoutStyle.js"

export default function EmoticonPaletteStatus({ status, conflict, notice, onRetry }) {
  return (
    <div className={EMOTICON_PALETTE_STATUS_WRAP_CLASS}>
      {status === "loading" ? (
        <p role="status" className={EMOTICON_PALETTE_STATUS_CLASS}>
          이모티콘 팔레트를 불러오는 중입니다.
        </p>
      ) : null}

      {status === "error" ? (
        <div role="alert" className={EMOTICON_PALETTE_ERROR_ROW_CLASS}>
          <span className={EMOTICON_PALETTE_STATUS_CLASS}>
            이모티콘 팔레트를 불러오지 못했습니다.
          </span>
          <button
            type="button"
            onClick={() => onRetry()}
            className={EMOTICON_PALETTE_RETRY_BTN_CLASS}
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {conflict ? (
        <p role="status" className={`${EMOTICON_PALETTE_STATUS_CLASS} ${EMOTICON_PALETTE_CONFLICT_CLASS}`}>
          팔레트가 다른 곳에서 먼저 변경되어 최신 값을 불러왔습니다. 확인한 뒤 다시 저장해 주세요.
        </p>
      ) : null}

      {notice ? (
        <p role="alert" className={`${EMOTICON_PALETTE_STATUS_CLASS} ${EMOTICON_PALETTE_NOTICE_ERROR_CLASS}`}>
          {notice.text}
        </p>
      ) : null}
    </div>
  )
}
