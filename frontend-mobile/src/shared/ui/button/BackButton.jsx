// 뒤로 가기 그림 버튼 (데스크톱 BackButton 그림, 누르는 칸 44px)
// 위 줄들(마이페이지·모드·방 설정·설정·상점·이모티콘·서고·대기방)이 씀
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const BUTTON_CLASS =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-90"

// 기본은 취소 소리(data-sfx-kind), 부르는 쪽이 소리를 직접 내면 sfxOwner로 기본음 막음
export default function BackButton({
  onClick,
  label = "뒤로 가기",
  src = NAVIGATION_ASSETS.backButton,
  sfxOwner = false,
  className = BUTTON_CLASS,
  iconClassName = "block h-full w-full select-none object-contain",
  ...rest
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      data-sfx-kind={sfxOwner ? undefined : "ui-cancel"}
      data-sfx-owner={sfxOwner ? "explicit" : undefined}
      className={className}
      {...rest}
    >
      <PublicAsset src={src} alt="" className={iconClassName} />
    </button>
  )
}
