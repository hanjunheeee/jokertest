/**
 * 이미지 기반 스크롤바 오버레이.
 *
 * scrollRef가 연결된 overflow 컨테이너와 썸 위치를 동기화합니다.
 *
 * props
 * - scrollRef: 스크롤되는 요소 ref
 * - trackSrc, thumbSrc: 트랙·썸 이미지 경로
 * - box: { top, height } | null — 트랙 영역 오프셋 (설정 패널 등)
 * - trackInset: { top, bottom } — 트랙 장식 구간 (높이 비율, 기본 CUSTOM_SCROLLBAR_TRACK_INSET)
 * - className: 래퍼 추가 클래스
 */
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

export default function Scrollbar({
  scrollRef,
  trackSrc = CUSTOM_SCROLLBAR_ASSETS.track,
  thumbSrc = CUSTOM_SCROLLBAR_ASSETS.thumb,
  box = null,
  trackInset = CUSTOM_SCROLLBAR_TRACK_INSET,
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
