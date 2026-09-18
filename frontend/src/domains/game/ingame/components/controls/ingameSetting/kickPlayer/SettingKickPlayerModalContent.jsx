/**
 * 플레이어 추방 모달 — 본문 (안내 + 스크롤 목록 + 확인 절차)
 *
 * F-21(AC-02): 목록과 액션을 **props로** 받는다. 예전에는 이 컴포넌트가 직접
 * useInGamePlayerSessionContext를 읽고 로컬 Set을 토글하기만 했다(서버 요청 0회, 확인 절차
 * 없음). 두 가지를 바꿨다:
 *
 *   1. 목록·액션을 주입받아 **같은 모달을 대기방에서도 쓴다** — 대기방에는
 *      InGamePlayerSessionProvider가 없으므로 컨텍스트를 직접 읽으면 훅이 던진다.
 *   2. 추방 버튼은 곧바로 보내지 않고 **확인 단계**를 연다. 취소는 소켓 요청 0회이고,
 *      확인 당시 대상의 소속이 바뀌었으면 그 확인은 무효다(useKickPlayerRequest가 판정한다).
 *
 * 결과 표시는 서버가 준 상태만 쓴다 — timeout·disconnect를 성공으로 바꾸지 않고, 확인할 수
 * 없으면 "결과 확인"으로 기존 키를 조회할 뿐 새 추방을 자동으로 다시 보내지 않는다.
 */
import { useRef } from "react"
import { getPlayerRecordListFallbackProfileAssets } from "../../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "../../../../constants/controls/ingameSetting/kickPlayer/ingameKickPlayerData.js"
import {
  INGAME_KICK_PLAYER_MODAL_NOTICE_CLASS,
  INGAME_KICK_PLAYER_MODAL_SCROLL_CLASS,
  INGAME_KICK_PLAYER_MODAL_SCROLL_WRAP_CLASS,
  INGAME_KICK_PLAYER_MODAL_SUBTITLE_CLASS,
} from "../../../../constants/controls/ingameSetting/kickPlayer/ingameKickPlayerLayout.js"
import { KICK_REQUEST_STATUS } from "../../../../hooks/useKickPlayerRequest.js"
import SettingKickPlayerRow from "./SettingKickPlayerRow.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

export default function SettingKickPlayerModalContent({
  /** 추방할 수 있는 대상들. 본인 제외는 화면이 이미 끝낸 상태로 넘긴다. */
  targets = [],
  /** 확인 중인 대상(useKickPlayerRequest.pendingTarget) 또는 null. */
  pendingTarget = null,
  status = KICK_REQUEST_STATUS.IDLE,
  errorCode = null,
  isSending = false,
  canLookupResult = false,
  /** 결과를 모르는 전송이 남아 서버 재확인을 기다리는 중인가(새 확인이 잠긴 상태). */
  isAwaitingResolution = false,
  onRequestConfirm,
  onCancelConfirm,
  onConfirmKick,
  onLookupResult,
  /** playerId → {color} (없으면 기본 색). 대기방은 넘기지 않는다. */
  getThemeStylesByPlayerId = null,
}) {
  const scrollRef = useRef(null)

  return (
    <>
      <p className={INGAME_KICK_PLAYER_MODAL_SUBTITLE_CLASS}>
        {INGAME_KICK_PLAYER_MODAL_COPY.subtitle}
      </p>
      <p className={INGAME_KICK_PLAYER_MODAL_NOTICE_CLASS}>{INGAME_KICK_PLAYER_MODAL_COPY.notice}</p>

      {/* 확인 단계. 여기서 취소해도 어떤 요청도 나가지 않는다. */}
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

      {/* 결과. 서버가 준 상태만 그대로 보여준다 — 미확인을 성공으로 바꾸지 않는다. */}
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

      {/* 내보낼 수 있는 사람이 없다는 것은 **상태**다. 빈 목록만 그리면 화면은 아직 못
          불러온 것인지 아무도 없는 것인지 말하지 못한다. */}
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
                // 같은 계정이 나갔다 다시 들어오면 **다른 소속**이다 — key를 uuid로 두면
                // React가 옛 행의 상태를 새 소속에 그대로 물려준다.
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
