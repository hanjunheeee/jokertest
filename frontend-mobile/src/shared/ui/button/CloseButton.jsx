// 닫기 그림 버튼 (데스크톱 팝업 닫기 그림, 누르는 칸 44px)
// 시트 머리 줄들(상점·대기방·착용·서고·친구)이 씀
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const BUTTON_CLASS =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none active:scale-95"

// 크기·자리·소리는 부르는 쪽 props (data-sfx-*·disabled·style 등은 그대로 넘김)
export default function CloseButton({
  label,
  onClick,
  src = STORE_ASSETS.popupCloseButton,
  className = BUTTON_CLASS,
  iconClassName = "block h-9 w-9 select-none object-contain",
  ...rest
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={className} {...rest}>
      <PublicAsset src={src} alt="" className={iconClassName} />
    </button>
  )
}
