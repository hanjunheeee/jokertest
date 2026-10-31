import { forwardRef } from "react";
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets";
import PublicAsset from "@/shared/ui/PublicAsset";

const SIZE_CLASS = {
  page: "w-[clamp(4.75rem,7.5vw,6.75rem)]",
  compact: "w-[clamp(2.35rem,4vw,2.85rem)] shrink-0",
}

const IMG_SCALE_CLASS = {
  page: "transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]",
  compact: "transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.9]",
}

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
