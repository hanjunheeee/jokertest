// 그림 스크롤 막대 (보기만, 데스크톱 Scrollbar의 모바일판)
// 서고 책 본문·이모티콘 판 목록이 씀, 손잡이가 좁아 손가락 끌기 대신 목록을 밀어서 스크롤
import { useRef } from "react"
import { CUSTOM_SCROLLBAR_ASSETS } from "@/shared/constants/customScrollbarAssets.js"
import {
  CUSTOM_SCROLLBAR_THUMB_CLASS,
  CUSTOM_SCROLLBAR_TRACK_CLASS,
  CUSTOM_SCROLLBAR_WRAP_CLASS,
} from "@/shared/constants/customScrollbarStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { useScrollThumbTop } from "@m/shared/hooks/useScrollThumbTop.js"

// 스크롤할 게 없으면 자리는 두고 숨김
export default function Scrollbar({ scrollRef, className = "", syncKey }) {
  const trackRef = useRef(null)
  const thumbRef = useRef(null)
  const { thumbTop, isScrollable } = useScrollThumbTop(scrollRef, trackRef, thumbRef, syncKey)

  return (
    <div
      ref={trackRef}
      className={`${CUSTOM_SCROLLBAR_WRAP_CLASS} inset-y-0 ${isScrollable ? "" : "opacity-0"} ${className}`.trim()}
      aria-hidden="true"
    >
      <PublicAsset src={CUSTOM_SCROLLBAR_ASSETS.track} alt="" className={CUSTOM_SCROLLBAR_TRACK_CLASS} />
      <PublicAsset
        ref={thumbRef}
        src={CUSTOM_SCROLLBAR_ASSETS.thumb}
        alt=""
        draggable={false}
        className={`${CUSTOM_SCROLLBAR_THUMB_CLASS} pointer-events-none`}
        style={{ top: `${thumbTop}px` }}
      />
    </div>
  )
}
