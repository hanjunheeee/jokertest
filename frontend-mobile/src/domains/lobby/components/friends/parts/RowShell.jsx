// 친구 시트 줄 하나의 틀 (비단 프레임·초상·이름·아래 글자·오른쪽 버튼 칸)
// 친구 추가·요청 수락·게임 초대·차단 탭의 줄들이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  RECOMMENDED_ACTIONS_CLASS,
  RECOMMENDED_INFO_WRAP_CLASS,
  RECOMMENDED_NAME_CLASS,
  RECOMMENDED_ROW_CLASS,
  RECOMMENDED_ROW_CONTENT_CLASS,
  RECOMMENDED_ROW_FRAME_CLASS,
  RECOMMENDED_TEXT_WRAP_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"
import ProfilePortrait from "@m/shared/ui/portrait/ProfilePortrait.jsx"

// 초상 크기는 데스크톱 PROFILE_PORTRAIT_WRAP_CLASS(3.6rem)
const PORTRAIT_CLASS = "z-[2] size-[3.6rem]"

// 데스크톱 RecommendedFriendRow·IncomingFriendRow·BlockedUserRow·GameInviteRow와 같은 겹침 (프레임 그림 비율대로 높이)
export default function RowShell({ name, photoId, borderId, actions = null, targeted = false, rowProps = {}, children = null }) {
  // 아이템 id를 그림 경로로 (없으면 기본 사진·평민 테두리)
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: photoId,
    accountProfileBorderId: borderId,
  })

  return (
    <li className={RECOMMENDED_ROW_CLASS} aria-current={targeted ? "true" : undefined} {...rowProps}>
      <PublicAsset src={FRIEND_LIST_ASSETS.rowFrame} alt="" className={RECOMMENDED_ROW_FRAME_CLASS} />
      <div className={RECOMMENDED_ROW_CONTENT_CLASS}>
        <div className={RECOMMENDED_INFO_WRAP_CLASS}>
          <ProfilePortrait photoSrc={portraitSrc} frameSrc={frameSrc} className={PORTRAIT_CLASS} aria-hidden="true" />
          <div className={RECOMMENDED_TEXT_WRAP_CLASS}>
            <p className={RECOMMENDED_NAME_CLASS}>{name}</p>
            {children}
          </div>
        </div>
        {actions !== null ? <div className={RECOMMENDED_ACTIONS_CLASS}>{actions}</div> : null}
      </div>
    </li>
  )
}
