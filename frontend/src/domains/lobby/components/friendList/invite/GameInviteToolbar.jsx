// 게임 초대 탭의 버튼 줄 (새로고침)
// GameInviteTab이 맨 위에 그림
import {
  FRIEND_ACCEPT_REFRESH_BUTTON_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS,
  FRIEND_ACCEPT_TOOLBAR_CLASS,
} from "../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"

// 받은 신청 탭과 같은 줄 모양을 씀
export default function GameInviteToolbar({ onRefresh }) {
  return (
    <div className={FRIEND_ACCEPT_TOOLBAR_CLASS}>
      <button
        type="button"
        onClick={onRefresh}
        aria-label="게임 초대 목록 새로고침"
        className={FRIEND_ACCEPT_REFRESH_BUTTON_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset src={FRIEND_LIST_ASSETS.refreshButton} alt="" className={FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS} />
      </button>
    </div>
  )
}
