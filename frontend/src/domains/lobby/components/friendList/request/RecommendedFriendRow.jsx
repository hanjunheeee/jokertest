// 친구 검색 결과 한 줄 (초상·이름·접속 상태·차단/신청 버튼)
// FriendRequestResultsList가 후보마다 그림
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import {
  RECOMMENDED_FRIEND_INFO_WRAP_CLASS,
  RECOMMENDED_FRIEND_NAME_CLASS,
  FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS,
  RECOMMENDED_FRIEND_ROW_CLASS,
  RECOMMENDED_FRIEND_ROW_CONTENT_CLASS,
  RECOMMENDED_FRIEND_ROW_FRAME_CLASS,
  RECOMMENDED_FRIEND_TEXT_WRAP_CLASS,
} from "../../../constants/friendListStyle.js"
import PlayerProfilePortrait from "../../../../../shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"
import { resolveAccountProfileAssets } from "../../../../../shared/utils/resolveAccountProfileAssets.js"
import RecommendedFriendStatus from "./row/RecommendedFriendStatus.jsx"
import RecommendedFriendActions from "./row/RecommendedFriendActions.jsx"

export { RECOMMENDED_FRIEND_STATUS_TEXT } from "../../../constants/recommendedFriend.js"

// 프로필 사진·테두리 id를 실제 그림 경로로 바꿔 초상에 넘김
export default function RecommendedFriendRow({
  id,
  name,
  status = "UNKNOWN",
  onSend,
  onBlock,
  sent,
  blocking = false,
  accountProfilePhotoId,
  accountProfileBorderId,
}) {
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({ accountProfilePhotoId, accountProfileBorderId })

  return (
    <li className={RECOMMENDED_FRIEND_ROW_CLASS} data-candidate-id={id}>
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className={RECOMMENDED_FRIEND_ROW_FRAME_CLASS}
      />
      <div className={RECOMMENDED_FRIEND_ROW_CONTENT_CLASS}>
        <div className={RECOMMENDED_FRIEND_INFO_WRAP_CLASS}>
          <PlayerProfilePortrait
            photoSrc={portraitSrc}
            frameSrc={frameSrc}
            wrapClassName={FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS}
          />
          <div className={RECOMMENDED_FRIEND_TEXT_WRAP_CLASS}>
            <p className={RECOMMENDED_FRIEND_NAME_CLASS}>{name}</p>
            <RecommendedFriendStatus status={status} />
          </div>
        </div>
        <RecommendedFriendActions
          id={id}
          name={name}
          onSend={onSend}
          onBlock={onBlock}
          sent={sent}
          blocking={blocking}
        />
      </div>
    </li>
  )
}
