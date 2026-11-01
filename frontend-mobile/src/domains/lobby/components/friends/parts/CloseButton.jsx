// 친구 시트 닫기 그림 버튼 (누르는 칸 44px)
// SheetHeader가 쓰고, 폰 가로에선 FriendsSheet가 탭 줄 끝에 한 번 더 그림 (머리를 숨겨 높이 아끼기)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { CLOSE_BUTTON_SRC } from "../sheetStyle.js"

// 위치·보임 여부는 바깥 className으로 정함
export default function CloseButton({ onClick, className = "grid" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="친구 목록 닫기"
      className={`size-11 shrink-0 place-items-center border-0 bg-transparent p-0 active:scale-95 ${className}`}
    >
      <PublicAsset src={CLOSE_BUTTON_SRC} alt="" className="block size-9 select-none object-contain" />
    </button>
  )
}
