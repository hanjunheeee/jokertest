// 줄 오른쪽 그림 버튼 하나 (데스크톱 줄 버튼 그림 크기, 누르는 칸만 44px)
// 친구 시트 줄들의 신청·수락·차단·거절·해제·초대 버튼이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { RECOMMENDED_SENT_BTN_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import { ACTION_BTN_CLASS, ACTION_IMG_CLASS } from "../sheetStyle.js"

// 처리 중엔 잠가 중복 요청을 막음 (데스크톱처럼 잠겨도 흐리게 하지 않음), dim은 이미 신청한 버튼 모양
// overlay는 글자 없는 그림 위에 얹는 글자 (거절 버튼)
export default function IconAction({ src, label, onClick, disabled = false, dim = false, overlay = null, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => { if (!disabled) onClick?.() }}
      className={`relative ${ACTION_BTN_CLASS} ${dim ? RECOMMENDED_SENT_BTN_CLASS : ""}`}
      {...rest}
    >
      <PublicAsset src={src} alt="" className={ACTION_IMG_CLASS} />
      {overlay ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center font-semibold text-[#f5f0e6] app-text-scaled [--app-text-size:13px]">
          {overlay}
        </span>
      ) : null}
    </button>
  )
}
