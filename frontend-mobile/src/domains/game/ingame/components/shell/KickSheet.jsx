// 카드 메뉴 추방 시트: 고른 대상 확인·추방·결과 글·대상 목록, 바닥에서 올라옴
// ActionProvider가 씀, 값은 데스크톱 useInGameKickFromCard 그대로 (데스크톱 InGamePage 카드 추방 창과 같은 내용)
import { createPortal } from "react-dom"
import { INGAME_KICK_PLAYER_MODAL_COPY as COPY } from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { KICK_REQUEST_STATUS } from "@/domains/game/ingame/constants/ingameKick.js"

const BTN_CLASS =
  "min-h-11 rounded-lg px-4 font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold active:scale-95 disabled:opacity-40"
const PRIMARY_CLASS = `${BTN_CLASS} bg-[#8c1c13] text-[#f5f0e6]`
const SECONDARY_CLASS = `${BTN_CLASS} bg-[#3a2e24] text-[#f5f0e6]`
const NOTE_CLASS = "font-subheading app-text-scaled [--app-text-size:0.85rem] leading-snug"

// 진행 상태 글 (실패·결과 모름·다시 확인 중)
function KickStatus({ kick }) {
  return (
    <>
      {kick.status === KICK_REQUEST_STATUS.FAILED ? (
        <p role="alert" className={`${NOTE_CLASS} text-[#ffb3a7]`}>{kick.errorCode}</p>
      ) : null}
      {kick.status === KICK_REQUEST_STATUS.UNKNOWN ? (
        <p role="alert" className={`${NOTE_CLASS} text-[#ffb3a7]`}>
          결과를 확인할 수 없습니다. 목록을 다시 확인한 뒤 새로 시도해주세요.
        </p>
      ) : null}
      {kick.canLookupResult && kick.status !== KICK_REQUEST_STATUS.SUCCEEDED ? (
        <button type="button" className={SECONDARY_CLASS} onClick={() => kick.lookupResult?.()}>결과 확인</button>
      ) : null}
      {kick.isAwaitingResolution ? (
        <p role="status" className={`${NOTE_CLASS} text-[#e3c27a]`}>
          현재 참가자 목록을 서버에서 다시 확인하는 중입니다. 확인이 끝나야 새로 지목할 수 있습니다.
        </p>
      ) : null}
    </>
  )
}

// 시트 (body에 포털, 화면 틀의 fixed 갇힘을 피함), 카드 시트(60/61) 위에 겹치는 시트 층 64
export default function KickSheet({ open, kick, onClose }) {
  if (!open) return null
  const { targets, pendingTarget, isSending } = kick

  return createPortal(
    <div className="fixed inset-0 z-[64] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        aria-label={COPY.closeAriaLabel}
        data-sfx-kind="ui-cancel"
        className="absolute inset-0 border-0 bg-black/65 p-0"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="추방"
        className="relative mx-auto flex max-h-[80dvh] w-full max-w-[34rem] flex-col gap-3 overflow-y-auto rounded-t-2xl border-2 border-b-0 border-[#c9b892]/45 bg-[#1d1611] px-4 pt-4 text-[#f5f0e6]"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <h2 className="text-center font-display app-text-scaled [--app-text-size:1.3rem] font-bold text-inherit">{COPY.title}</h2>
        <p className={NOTE_CLASS}>{COPY.subtitle}</p>
        <p className={`${NOTE_CLASS} opacity-75`}>{COPY.notice}</p>

        {pendingTarget ? (
          <div role="alertdialog" aria-label="추방 확인" className="flex items-center gap-2 rounded-lg bg-black/40 p-2">
            <p className="min-w-0 flex-1 truncate font-subheading font-bold">{pendingTarget.nickname || pendingTarget.uuid}</p>
            <button type="button" className={PRIMARY_CLASS} disabled={isSending} onClick={() => kick.confirmKick(targets)}>
              {COPY.kickActionLabel}
            </button>
            <button type="button" data-sfx-kind="ui-cancel" className={SECONDARY_CLASS} onClick={onClose}>취소</button>
          </div>
        ) : null}

        <KickStatus kick={kick} />

        {targets.length === 0 ? <p role="status" className={NOTE_CLASS}>{COPY.emptyTargets}</p> : null}
        <ul aria-label={COPY.listAriaLabel} className="flex flex-col gap-1.5">
          {targets.map((player) => (
            <li key={player.membershipId ?? player.uuid} className="flex items-center gap-2 rounded-lg bg-black/25 px-3 py-1">
              <span className="min-w-0 flex-1 truncate font-subheading">{player.nickname}</span>
              <button
                type="button"
                className={SECONDARY_CLASS}
                disabled={isSending}
                aria-label={pendingTarget?.membershipId === player.membershipId ? COPY.pendingAriaLabel : `${player.nickname} ${COPY.kickActionLabel}`}
                onClick={() => kick.requestConfirm(player)}
              >
                {pendingTarget?.membershipId === player.membershipId ? COPY.pendingLabel : COPY.kickActionLabel}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
