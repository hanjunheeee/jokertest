// 게임 초대 탭의 버튼 줄 (새로고침)
// GameInviteTab이 맨 위에 그림
import {
  ACCEPT_REFRESH_BTN_CLASS,
  ACCEPT_REFRESH_BTN_IMG_CLASS,
  ACCEPT_TOOLBAR_CLASS,
} from "../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"

// 받은 신청 탭과 같은 줄 모양을 씀
export default function GameInviteToolbar({ onRefresh }) {
  return (
    <div className={ACCEPT_TOOLBAR_CLASS}>
      <button
        type="button"
        onClick={onRefresh}
        aria-label="게임 초대 목록 새로고침"
        className={ACCEPT_REFRESH_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset src={FRIEND_LIST_ASSETS.refreshButton} alt="" className={ACCEPT_REFRESH_BTN_IMG_CLASS} />
      </button>
    </div>
  )
}
