// 설정의 판 추방 시트: 안내 글·진행 표시·대상 목록 (설정 시트 위에 겹쳐 뜸)
// SettingsSheet가 씀, 추방 동작은 데스크톱 useInGameKickFromCard 그대로 (SettingKickPlayerModal과 같음)
import { useEffect } from "react"
import { INGAME_KICK_PLAYER_MODAL_COPY as COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { getPlayerRecordListFallbackProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { useInGameKickFromCard } from "@/domains/game/ingame/hooks/useInGameKickFromCard.js"
import Sheet from "../frame/Sheet.jsx"
import KickRow from "./KickRow.jsx"
import KickStatus from "./KickStatus.jsx"

const NOTE_CLASS = "font-subheading app-text-scaled [--app-text-size:0.85rem] leading-snug text-center"

// 추방 훅 값을 시트에 그대로 그림
export default function KickSheet({ open, onClose }) {
  const kick = useInGameKickFromCard()
  const { targets, pendingTarget, isSending, reset } = kick

  // 시트가 닫히면 추방 진행 상태를 처음으로 되돌림
  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  return (
    <Sheet open={open} onClose={onClose} title={COPY.title} closeLabel={COPY.closeAriaLabel} layer="top" testId="kick-sheet">
      <div className="flex flex-col gap-2">
        <p className={`${NOTE_CLASS} font-bold text-[#f5f0e6]`}>{COPY.subtitle}</p>
        <p className={`${NOTE_CLASS} text-[#e6dcc8]/80`}>{COPY.notice}</p>

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
          <p role="status" data-testid="kick-empty-targets" className={`${NOTE_CLASS} py-4 text-[#e6dcc8]`}>
            {COPY.emptyTargets}
          </p>
        ) : null}

        <ul aria-label={COPY.listAriaLabel} className="flex flex-col">
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
    </Sheet>
  )
}
