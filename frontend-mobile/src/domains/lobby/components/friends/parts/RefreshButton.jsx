// 목록 새로고침 그림 버튼
// 요청 수락·게임 초대·차단 탭의 버튼 줄이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"

// 데스크톱 새로고침처럼 누르면 그림만 줄어듦 (interactive-scale-sm), 누르는 칸은 44px
export default function RefreshButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group grid size-11 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0"
    >
      <PublicAsset src={FRIEND_LIST_ASSETS.refreshButton} alt="" className="interactive-scale-sm h-auto w-7 select-none" />
    </button>
  )
}
