// 친구 검색 결과 한 줄 (초상·이름·접속 상태·신청 실패 문구·차단/신청 버튼)
// AddTab이 후보마다 그림
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import RowShell from "../parts/RowShell.jsx"
import OnlineStatus from "../parts/OnlineStatus.jsx"
import IconAction from "../parts/IconAction.jsx"
import { STATUS_DETAIL_ERROR_CLASS } from "@/domains/lobby/constants/friendListStyle.js"

// 이미 신청한 상대는 신청 버튼을 흐리게 하고 다시 안 보냄 (데스크톱 RecommendedFriendActions와 같음)
// 보내는 중엔 신청 버튼 잠금, 실패하면 이름 아래 문구 (데스크톱 FriendRequestResultsList의 sendErrors)
export default function CandidateRow({ candidate, sent, sending = false, sendError = null, blocking, onSend, onBlock }) {
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
        disabled={sending}
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
      {sendError !== null ? (
        <p role="alert" data-send-error={id} className={STATUS_DETAIL_ERROR_CLASS}>{sendError}</p>
      ) : null}
    </RowShell>
  )
}
