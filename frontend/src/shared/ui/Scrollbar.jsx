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

// 이미지 트랙과 이미지 썸을 사용하는 공통 커스텀 스크롤바입니다.
export default function Scrollbar({
  scrollRef,
  trackSrc = CUSTOM_SCROLLBAR_ASSETS.track,
  thumbSrc = CUSTOM_SCROLLBAR_ASSETS.thumb,
  box = null,
  trackInset = CUSTOM_SCROLLBAR_TRACK_INSET,
  className = "",
}) {
  // 스크롤바 트랙 DOM입니다. 썸 이동 범위 계산에 사용합니다.
  const trackRef = useRef(null)

  // 실제로 드래그되는 썸 DOM입니다.
  const thumbRef = useRef(null)

  // 스크롤 위치와 썸 위치를 서로 동기화하는 훅입니다.
  const { thumbTop, isScrollable, onThumbPointerDown } = useScrollbarThumb(
    scrollRef,
    trackRef,
    thumbRef,
    trackInset,
  )

  // 특정 행 영역에만 스크롤바를 맞춰야 할 때 top/height를 외부에서 받습니다.
  const wrapStyle =
    box != null ? { top: box.top, height: box.height } : undefined

  // scrollRef가 없으면 정적 장식으로 보여주고, 있으면 실제 스크롤 가능 여부를 따릅니다.
  const showScrollbar = !scrollRef || isScrollable

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
