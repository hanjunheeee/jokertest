// 그림 스크롤 막대 (막대·손잡이 그림, 손잡이 끌기)
// auth 가입·ingame 설정·추방·기록·matching 친구 초대·result·notifications·settings·user 이모티콘·스킨 목록이 씀
import { useRef } from "react"
import { CUSTOM_SCROLLBAR_ASSETS } from "@/shared/constants/customScrollbarAssets.js"
import {
  CUSTOM_SCROLLBAR_THUMB_CLASS,
  CUSTOM_SCROLLBAR_TRACK_CLASS,
  CUSTOM_SCROLLBAR_TRACK_INSET,
  CUSTOM_SCROLLBAR_WRAP_CLASS,
} from "@/shared/constants/customScrollbarStyles.js"
import { useScrollbarThumb } from "@/shared/hooks/useScrollbarThumb.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 스크롤할 게 없으면 자리는 두고 숨김(opacity 0), box를 주면 막대 위치·높이를 그 값으로
export default function Scrollbar({
  scrollRef,
  trackSrc = CUSTOM_SCROLLBAR_ASSETS.track,
  thumbSrc = CUSTOM_SCROLLBAR_ASSETS.thumb,
  box = null,
  trackInset = CUSTOM_SCROLLBAR_TRACK_INSET,
  alwaysVisible = false,
  className = "",
}) {
  const trackRef = useRef(null)

  const thumbRef = useRef(null)

  const { thumbTop, isScrollable, onThumbPointerDown } = useScrollbarThumb(
    scrollRef,
    trackRef,
    thumbRef,
    trackInset,
  )

  const wrapStyle =
    box != null ? { top: box.top, height: box.height } : undefined

  // 늘 보이기·스크롤 대상 없음·스크롤 가능일 때 보임
  const showScrollbar = alwaysVisible || !scrollRef || isScrollable

  return (
    <div
      ref={trackRef}
      className={`${CUSTOM_SCROLLBAR_WRAP_CLASS} ${box == null ? "inset-y-0" : ""} ${showScrollbar ? "" : "opacity-0"} ${className}`.trim()}
      style={wrapStyle}
      aria-hidden="true"
    >
      <PublicAsset
        src={trackSrc}
        alt=""
        className={CUSTOM_SCROLLBAR_TRACK_CLASS}
      />
      {/* 손잡이 그림, 숨김일 땐 포인터를 안 받음 */}
      <img
        ref={thumbRef}
        src={publicAsset(thumbSrc)}
        alt=""
        draggable={false}
        className={`${CUSTOM_SCROLLBAR_THUMB_CLASS} ${
          showScrollbar
            ? "pointer-events-auto cursor-grab active:cursor-grabbing"
            : "pointer-events-none"
        }`}
        style={{ top: `${thumbTop}px` }}
        onPointerDown={showScrollbar ? onThumbPointerDown : undefined}
      />
    </div>
  )
}
