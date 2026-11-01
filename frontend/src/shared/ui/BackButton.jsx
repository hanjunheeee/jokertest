// 뒤로 가기 그림 버튼 (화면용 page, 작은 compact 두 크기)
// auth 틀·mode 컨트롤·lobby 친구 목록 탭과 MotionBackButton이 씀
import { forwardRef } from "react";
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets";
import PublicAsset from "@/shared/ui/PublicAsset";

const SIZE_CLASS = {
  page: "w-[clamp(4.75rem,7.5vw,6.75rem)]",
  compact: "w-[clamp(2.35rem,4vw,2.85rem)] shrink-0",
}

// 작은 버튼은 누를 때 더 줄여 눌린 게 보이게
const IMG_SCALE_CLASS = {
  page: "transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]",
  compact: "transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.9]",
}

// ref를 받아야 MotionBackButton이 감쌀 수 있음, 누르면 취소 소리(data-sfx-kind)
const BackButton = forwardRef(function BackButton(
  { onClick, size = "page", className = "", ariaLabel = "뒤로 가기", style, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      data-sfx-kind="ui-cancel"
      className={`group block cursor-pointer border-0 bg-transparent p-0 leading-none ${SIZE_CLASS[size]} ${className}`}
      style={{ outline: "none", ...style }}
      {...props}
    >
      <PublicAsset
        src={NAVIGATION_ASSETS.backButton}
        alt=""
        className={`block h-auto w-full select-none ${IMG_SCALE_CLASS[size]}`}
      />
    </button>
  )
})

export default BackButton
