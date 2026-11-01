// 친구 검색 결과 한 줄 (초상·이름·접속 상태·차단/신청 버튼)
// AddTab이 후보마다 그림
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import RowShell from "../parts/RowShell.jsx"
import OnlineStatus from "../parts/OnlineStatus.jsx"
import IconAction from "../parts/IconAction.jsx"

// 이미 신청한 상대는 신청 버튼을 흐리게 하고 다시 안 보냄 (데스크톱 RecommendedFriendActions와 같음)
export default function CandidateRow({ candidate, sent, blocking, onSend, onBlock }) {
  const { id, name } = candidate

  const actions = (
    <>
      <IconAction
        src={FRIEND_LIST_ASSETS.friendBlockButton}
        label={`${name} 차단`}
        disabled={blocking}
        data-block-target={id}
        onClick={() => onBlock?.(id)}
      />
      <IconAction
        src={FRIEND_LIST_ASSETS.friendRequestButton}
        label={sent ? "신청 완료" : `${name}에게 친구 신청`}
        dim={sent}
        onClick={() => { if (!sent) onSend?.(id) }}
      />
    </>
  )

  return (
    <RowShell
      name={name}
      photoId={candidate.accountProfilePhotoId}
      borderId={candidate.accountProfileBorderId}
      actions={actions}
      rowProps={{ "data-candidate-id": id }}
    >
      <OnlineStatus status={candidate.status} />
    </RowShell>
  )
}
