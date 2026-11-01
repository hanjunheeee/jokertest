// 친구 시트 줄 하나의 틀 (비단 프레임 바탕·앞 칸·초상·이름·아래 글자·오른쪽 버튼 칸)
// 목록·추가·요청·초대·차단 탭의 줄들이 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { resolveAccountProfileAssets } from "@/shared/utils/resolveAccountProfileAssets.js"
import ProfilePortrait from "@m/shared/ui/portrait/ProfilePortrait.jsx"
import { NAME_CLASS, ROW_CLASS, ROW_FRAME_CLASS, ROW_TARGET_CLASS } from "../sheetStyle.js"

// onOpen이 있으면 초상·이름 칸 전체를 누르는 버튼으로 만듦 (줄 동작 메뉴 열기)
export default function RowShell({
  name,
  photoId,
  borderId,
  lead = null,
  actions = null,
  onOpen = null,
  openLabel,
  targeted = false,
  rowProps = {},
  children = null,
}) {
  // 아이템 id를 그림 경로로 (없으면 기본 사진·평민 테두리)
  const { portraitSrc, frameSrc } = resolveAccountProfileAssets({
    accountProfilePhotoId: photoId,
    accountProfileBorderId: borderId,
  })
  const body = (
    <>
      <ProfilePortrait photoSrc={portraitSrc} frameSrc={frameSrc} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-left">
        <p className={NAME_CLASS}>{name}</p>
        {children}
      </div>
    </>
  )

  return (
    <li
      className={`${ROW_CLASS} ${targeted ? ROW_TARGET_CLASS : ""}`}
      aria-current={targeted ? "true" : undefined}
      {...rowProps}
    >
      <PublicAsset src={FRIEND_LIST_ASSETS.rowFrame} alt="" className={ROW_FRAME_CLASS} />
      {lead}
      {onOpen !== null ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          aria-haspopup="menu"
          className="relative flex min-h-12 min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 active:opacity-80"
        >
          {body}
          <span aria-hidden="true" className="shrink-0 px-1 text-xl leading-none text-white/70">⋯</span>
        </button>
      ) : (
        <div className="relative flex min-w-0 flex-1 items-center gap-2">{body}</div>
      )}
      {actions !== null ? (
        <div className="relative flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
    </li>
  )
}
