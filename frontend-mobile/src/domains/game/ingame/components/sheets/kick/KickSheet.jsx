// 설정의 판 추방 창: 투표 창 틀 그림·제목·닫기 + 안내 글·진행 표시·대상 목록 (설정 시트 위 가운데)
// SettingsSheet가 씀, 추방 동작은 데스크톱 useInGameKickFromCard 그대로 (SettingKickPlayerModal과 같음)
import { useEffect } from "react"
import { INGAME_KICK_PLAYER_MODAL_ASSETS as FRAME_ASSETS } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerAssets.js"
import { INGAME_KICK_PLAYER_MODAL_COPY as COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { getPlayerRecordListFallbackProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { useInGameKickFromCard } from "@/domains/game/ingame/hooks/useInGameKickFromCard.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import Modal from "../frame/Modal.jsx"
import KickRow from "./KickRow.jsx"
import KickStatus from "./KickStatus.jsx"
import { KICK_CLOSE_STYLE, KICK_FRAME_STYLE, KICK_TITLE_STYLE, NOTICE_CLASS, SUBTITLE_CLASS } from "./kickStyle.js"

// 추방 훅 값을 창에 그대로 그림
export default function KickSheet({ open, onClose }) {
  const kick = useInGameKickFromCard()
  const { targets, pendingTarget, isSending, reset } = kick

  // 창이 닫히면 추방 진행 상태를 처음으로 되돌림
  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={COPY.closeAriaLabel}
      ariaLabel={COPY.title}
      testId="kick-sheet"
      className="flex max-h-full flex-col text-white"
      style={KICK_FRAME_STYLE}
    >
      {/* 제목은 틀 위쪽 판 자리, 닫기는 오른쪽 위 (둘 다 틀 테두리 안에 겹침) */}
      <h2 className="pointer-events-none absolute inset-x-0 flex items-center justify-center font-display app-text-scaled [--app-text-size:1.4rem] font-medium leading-none text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]" style={KICK_TITLE_STYLE}>
        {COPY.title}
      </h2>
      <button
        type="button"
        aria-label={COPY.closeAriaLabel}
        onClick={onClose}
        data-sfx-kind="ui-cancel"
        className="absolute right-0 z-10 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-95"
        style={KICK_CLOSE_STYLE}
      >
        <PublicAsset src={FRAME_ASSETS.closeButton} alt="" className="block h-10 w-10 select-none object-contain" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-[5%] pb-2">
        <p className={SUBTITLE_CLASS}>{COPY.subtitle}</p>
        <p className={NOTICE_CLASS}>{COPY.notice}</p>

        <KickStatus
          targets={targets}
          pendingTarget={pendingTarget}
          status={kick.status}
          errorCode={kick.errorCode}
          isSending={isSending}
          canLookupResult={kick.canLookupResult}
          isAwaitingResolution={kick.isAwaitingResolution}
          onCancelConfirm={kick.cancelConfirm}
          onConfirmKick={kick.confirmKick}
          onLookupResult={kick.lookupResult}
        />

        {targets.length === 0 ? (
          <p role="status" data-testid="kick-empty-targets" className={`${NOTICE_CLASS} py-3`}>
            {COPY.emptyTargets}
          </p>
        ) : null}

        <ul aria-label={COPY.listAriaLabel} className="flex flex-col gap-1.5">
          {targets.map((player, index) => {
            // 프로필 그림은 줄 순서대로 기본 그림을 돌려 씀 (데스크톱과 같음)
            const { profilePhotoSrc, profileBorderSrc } = getPlayerRecordListFallbackProfileAssets(index)
            return (
              <KickRow
                key={player.membershipId ?? player.uuid}
                name={player.nickname}
                profilePhotoSrc={profilePhotoSrc}
                profileBorderSrc={profileBorderSrc}
                isPending={pendingTarget?.membershipId === player.membershipId}
                disabled={isSending}
                onKick={() => kick.requestConfirm?.(player)}
              />
            )
          })}
        </ul>
      </div>
    </Modal>
  )
}
