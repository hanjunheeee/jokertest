/**
 * F-19(AC-04) 차단 목록 탭.
 *
 * 소유자만 자기 차단을 본다. 해제 버튼은 서버의 DELETE /friends/blocks/:targetId로 이어지고,
 * 그 쿼리의 WHERE에는 인증 owner가 강제되므로 다른 계정의 차단은 어떤 경로로도 지워지지
 * 않는다 — 화면은 그 사실을 표시할 뿐 권한 경계가 아니다.
 *
 * 해제는 **차단 관계만** 없앤다. 차단 시점에 무효화된 과거 친구 요청·게임 초대는 되살아나지
 * 않는다(AC-05). 반대로 기존 친구 관계는 보존돼 있어 해제하면 친구 목록에 다시 나타난다.
 */
import {
  FRIEND_ACCEPT_BACK_BUTTON_CLASS,
  FRIEND_ACCEPT_EMPTY_CLASS,
  FRIEND_ACCEPT_LIST_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_CLASS,
  FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS,
  FRIEND_ACCEPT_TAB_CLASS,
  FRIEND_ACCEPT_TOOLBAR_CLASS,
  FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS,
  RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS,
  RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS,
  RECOMMENDED_FRIEND_ACTIONS_CLASS,
  RECOMMENDED_FRIEND_INFO_WRAP_CLASS,
  RECOMMENDED_FRIEND_NAME_CLASS,
  RECOMMENDED_FRIEND_ROW_CLASS,
  RECOMMENDED_FRIEND_ROW_CONTENT_CLASS,
  RECOMMENDED_FRIEND_ROW_FRAME_CLASS,
  RECOMMENDED_FRIEND_TEXT_WRAP_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import BackButton from "@/shared/ui/BackButton.jsx"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"

function BlockedUserRow({ user, onUnblock, processing }) {
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: user.accountProfilePhotoId,
    accountProfileBorderId: user.accountProfileBorderId,
  })

  return (
    <li className={RECOMMENDED_FRIEND_ROW_CLASS} data-blocked-id={user.id}>
      <PublicAsset src={FRIEND_LIST_ASSETS.rowFrame} alt="" className={RECOMMENDED_FRIEND_ROW_FRAME_CLASS} />
      <div className={RECOMMENDED_FRIEND_ROW_CONTENT_CLASS}>
        <div className={RECOMMENDED_FRIEND_INFO_WRAP_CLASS}>
          <PlayerProfilePortrait
            photoSrc={portraitSrc}
            frameSrc={frameSrc}
            wrapClassName={FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS}
          />
          <div className={RECOMMENDED_FRIEND_TEXT_WRAP_CLASS}>
            <p className={RECOMMENDED_FRIEND_NAME_CLASS}>{user.name}</p>
          </div>
        </div>
        <div className={RECOMMENDED_FRIEND_ACTIONS_CLASS}>
          <button
            type="button"
            className={RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS}
            aria-label={`${user.name} 차단 해제`}
            aria-disabled={processing}
            disabled={processing}
            data-unblock-target={user.id}
            onClick={() => { if (!processing) onUnblock(user.id) }}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.friendAcceptButton}
              alt=""
              className={RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS}
            />
          </button>
        </div>
      </div>
    </li>
  )
}

export default function FriendBlockTab({
  onBack,
  blockedUsers = [],
  status = "idle",
  error = null,
  processingIds = new Set(),
  onUnblock,
  onRefresh,
}) {
  return (
    <div className={FRIEND_ACCEPT_TAB_CLASS}>
      <div className={FRIEND_ACCEPT_TOOLBAR_CLASS}>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="차단 목록 새로고침"
          className={FRIEND_ACCEPT_REFRESH_BUTTON_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset src={FRIEND_LIST_ASSETS.refreshButton} alt="" className={FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS} />
        </button>
      </div>

      {error !== null ? (
        <p role="status" data-block-list-error="true" className={FRIEND_ACCEPT_EMPTY_CLASS}>
          {error}
        </p>
      ) : null}

      <ul className={FRIEND_ACCEPT_LIST_CLASS} aria-label="차단한 사용자">
        {blockedUsers.length === 0 ? (
          <li className={FRIEND_ACCEPT_EMPTY_CLASS}>
            {status === "loading" ? "차단 목록을 불러오는 중입니다." : "차단한 사용자가 없습니다."}
          </li>
        ) : (
          blockedUsers.map((user) => (
            <BlockedUserRow
              key={user.id}
              user={user}
              onUnblock={onUnblock}
              processing={processingIds.has(user.id)}
            />
          ))
        )}
      </ul>

      <BackButton
        size="compact"
        ariaLabel="친구 목록으로 돌아가기"
        onClick={onBack}
        className={FRIEND_ACCEPT_BACK_BUTTON_CLASS}
      />
    </div>
  )
}
