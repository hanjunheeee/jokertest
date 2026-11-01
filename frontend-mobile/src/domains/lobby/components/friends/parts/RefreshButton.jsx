// 목록 새로고침 그림 버튼
// 요청 수락·게임 초대·차단 탭의 버튼 줄이 씀
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import IconAction from "./IconAction.jsx"

// 탭마다 읽기 이름만 바꿔 씀
export default function RefreshButton({ label, onClick }) {
  return <IconAction src={FRIEND_LIST_ASSETS.refreshButton} label={label} onClick={onClick} imgClassName="size-8" />
}
