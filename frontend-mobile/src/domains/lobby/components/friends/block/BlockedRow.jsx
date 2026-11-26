// 차단 목록 한 줄 (초상·이름·차단 해제 버튼·해제 실패 문구)
// BlockTab이 차단한 사용자마다 그림
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { STATUS_DETAIL_ERROR_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import RowShell from "../parts/RowShell.jsx"
import IconAction from "../parts/IconAction.jsx"

// 해제 처리 중엔 버튼을 잠가 중복 요청을 막음 (데스크톱 BlockedUserRow와 같음)
export default function BlockedRow({ user, processing, error = null, onUnblock }) {
  return (
    <RowShell
      name={user.name}
      photoId={user.accountProfilePhotoId}
      borderId={user.accountProfileBorderId}
      rowProps={{ "data-blocked-id": user.id }}
      actions={(
        <IconAction
          src={FRIEND_LIST_ASSETS.friendAcceptButton}
          label={`${user.name} 차단 해제`}
          disabled={processing}
          data-unblock-target={user.id}
          onClick={() => onUnblock(user.id)}
        />
      )}
      footer={error !== null ? (
        <p role="alert" data-unblock-error={user.id} className={STATUS_DETAIL_ERROR_CLASS}>{error}</p>
      ) : null}
    />
  )
}
