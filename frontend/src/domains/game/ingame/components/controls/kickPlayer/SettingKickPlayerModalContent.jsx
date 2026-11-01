import { useRef } from "react"
import { getPlayerRecordListFallbackProfileAssets } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "../../../constants/controls/kickPlayer/ingameKickPlayerData.js"
import {
  INGAME_KICK_PLAYER_MODAL_NOTICE_CLASS,
  INGAME_KICK_PLAYER_MODAL_SCROLL_CLASS,
  INGAME_KICK_PLAYER_MODAL_SCROLL_WRAP_CLASS,
  INGAME_KICK_PLAYER_MODAL_SUBTITLE_CLASS,
} from "../../../constants/controls/kickPlayer/ingameKickPlayerLayout.js"
import { KICK_REQUEST_STATUS } from "../../../constants/ingameKick.js"
import SettingKickPlayerRow from "./SettingKickPlayerRow.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

export default function SettingKickPlayerModalContent({
  targets = [],
  pendingTarget = null,
  status = KICK_REQUEST_STATUS.IDLE,
  errorCode = null,
  isSending = false,
  canLookupResult = false,
  isAwaitingResolution = false,
  onRequestConfirm,
  onCancelConfirm,
  onConfirmKick,
  onLookupResult,
  getThemeStylesByPlayerId = null,
}) {
  const scrollRef = useRef(null)

  return (
    <>
      <p className={INGAME_KICK_PLAYER_MODAL_SUBTITLE_CLASS}>
        {INGAME_KICK_PLAYER_MODAL_COPY.subtitle}
      </p>
      <p className={INGAME_KICK_PLAYER_MODAL_NOTICE_CLASS}>{INGAME_KICK_PLAYER_MODAL_COPY.notice}</p>

      {pendingTarget ? (
        <div role="alertdialog" aria-label="추방 확인" data-testid="kick-confirm">
          <p data-testid="kick-confirm-target">{pendingTarget.nickname || pendingTarget.uuid}</p>
          <button
            type="button"
            data-testid="kick-confirm-accept"
            disabled={isSending}
            onClick={() => onConfirmKick?.(targets)}
          >
            추방
          </button>
          <button
            type="button"
            data-testid="kick-confirm-cancel"
            data-sfx-kind="ui-cancel"
            onClick={() => onCancelConfirm?.()}
          >
            취소
          </button>
        </div>
      ) : null}

      {status === KICK_REQUEST_STATUS.FAILED ? (
        <p role="alert" data-testid="kick-error">{errorCode}</p>
      ) : null}
      {status === KICK_REQUEST_STATUS.UNKNOWN ? (
        <p role="alert" data-testid="kick-unknown">
          결과를 확인할 수 없습니다. 목록을 다시 확인한 뒤 새로 시도해주세요.
        </p>
      ) : null}
      {canLookupResult && status !== KICK_REQUEST_STATUS.SUCCEEDED ? (
        <button type="button" data-testid="kick-lookup-result" onClick={() => onLookupResult?.()}>
          결과 확인
        </button>
      ) : null}
      {isAwaitingResolution ? (
        <p role="status" data-testid="kick-awaiting-resolution">
          현재 참가자 목록을 서버에서 다시 확인하는 중입니다. 확인이 끝나야 새로 지목할 수 있습니다.
        </p>
      ) : null}

      {targets.length === 0 ? (
        <p role="status" data-testid="kick-empty-targets">
          {INGAME_KICK_PLAYER_MODAL_COPY.emptyTargets}
        </p>
      ) : null}

      <div className={INGAME_KICK_PLAYER_MODAL_SCROLL_WRAP_CLASS}>
        <ul
          ref={scrollRef}
          className={INGAME_KICK_PLAYER_MODAL_SCROLL_CLASS}
          aria-label={INGAME_KICK_PLAYER_MODAL_COPY.listAriaLabel}
        >
          {targets.map((player, index) => {
            const { profilePhotoSrc, profileBorderSrc } =
              getPlayerRecordListFallbackProfileAssets(index)

            return (
              <SettingKickPlayerRow
                key={player.membershipId ?? player.uuid}
                playerId={player.uuid}
                name={player.nickname}
                profilePhotoSrc={profilePhotoSrc}
                profileBorderSrc={profileBorderSrc}
                isPending={pendingTarget?.membershipId === player.membershipId}
                disabled={isSending}
                themeStyles={getThemeStylesByPlayerId ? getThemeStylesByPlayerId(player.uuid) : null}
                onKick={() => onRequestConfirm?.(player)}
              />
            )
          })}
        </ul>

        <Scrollbar scrollRef={scrollRef} />
      </div>
    </>
  )
}
