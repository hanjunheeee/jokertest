/**
 * 플레이어 추방 모달 shell — document.body portal, 투표현황창 프레임.
 *
 * F-21(AC-02): 더 이상 UI 전용이 아니다. **진행 중 세션**의 추방을 실제 서버 명령
 * (kick_game_player)에 잇는다 — 목록은 ingameStore의 canonical roster에서 오고, 확인·전송·
 * 실패·결과 재조회 수명은 대기방과 공유하는 useKickPlayerRequest가 소유한다.
 *
 * 대기방은 이 shell을 쓰지 않고 SettingKickPlayerModalContent를 직접 렌더한다(그쪽에는
 * InGamePlayerSessionProvider도 인게임 store도 없다).
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useAuthStore } from "../../../../../../auth/store/auth.store.js"
import { useInGameStore } from "../../../../store/ingameStore.js"
import { useKickPlayerRequest } from "../../../../hooks/useKickPlayerRequest.js"
import { INGAME_KICK_PLAYER_MODAL_ASSETS } from "../../../../constants/controls/ingameSetting/kickPlayer/ingameKickPlayerAssets.js"
import { INGAME_KICK_PLAYER_MODAL_COPY } from "../../../../constants/controls/ingameSetting/kickPlayer/ingameKickPlayerData.js"
import {
  getInGameKickPlayerPanelStyle,
  INGAME_KICK_PLAYER_MODAL_BACKDROP_CLASS,
  INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_CLASS,
  INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_IMG_CLASS,
  INGAME_KICK_PLAYER_MODAL_FRAME_IMAGE_CLASS,
  INGAME_KICK_PLAYER_MODAL_INNER_CLASS,
  INGAME_KICK_PLAYER_MODAL_INSET,
  INGAME_KICK_PLAYER_MODAL_SHELL_CLASS,
  INGAME_KICK_PLAYER_MODAL_TITLE_CLASS,
  INGAME_KICK_PLAYER_MODAL_WRAP_CLASS,
} from "../../../../constants/controls/ingameSetting/kickPlayer/ingameKickPlayerLayout.js"
import SettingKickPlayerModalContent from "./SettingKickPlayerModalContent.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"

export default function SettingKickPlayerModal({ open, onClose }) {
  const [mounted, setMounted] = useState(false)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const gameId = useInGameStore((s) => s.gameId)
  const state = useInGameStore((s) => s.state)

  // 추방 목록은 **아직 참여 중인** 참가자다. 사망 여부로 거르지 않는다 — 사망했어도 참여
  // 중이면 추방할 수 있고(A-06), 참여가 끝난 참가자만 목록에서 빠진다.
  const targets = useMemo(() => (state?.players ?? [])
    .filter((player) => player?.uuid && player.uuid !== authUuid)
    .filter((player) => player.isParticipating !== false)
    .map((player) => ({
      uuid: player.uuid,
      nickname: player.nickname,
      membershipId: player.membershipId ?? null,
    })), [state, authUuid])

  // 확인이 열린 뒤 이 화면이 다른 판으로 옮겨갔는지 판정하는 값이다.
  const getMembershipScopeId = useCallback(() => gameId ?? null, [gameId])

  const buildRequest = useCallback(({ target, requestId }) => {
    const current = useInGameStore.getState()
    const currentState = current.state
    if (!current.gameId || !currentState) return null
    // 요청자 자신의 소속도 서버 roster에서 읽는다 — 화면이 만들어 낸 값을 보내지 않는다.
    const requesterMembershipId = (currentState.players ?? [])
      .find((player) => player.uuid === authUuid)?.membershipId ?? null
    if (!requesterMembershipId || !target.membershipId) return null
    if (!currentState.roomId || !currentState.roomInstanceId || !currentState.bootEpoch) return null
    return {
      requestId,
      bootEpoch: currentState.bootEpoch,
      roomId: currentState.roomId,
      roomInstanceId: currentState.roomInstanceId,
      requesterMembershipId,
      targetUuid: target.uuid,
      targetMembershipId: target.membershipId,
      gameId: current.gameId,
    }
  }, [authUuid])

  const kick = useKickPlayerRequest({ scope: "GAME", buildRequest, getMembershipScopeId })

  useEffect(() => {
    setMounted(true)
  }, [])

  // 모달을 닫으면 확인 중인 대상과 안내를 함께 정리한다 — 다음에 열었을 때 옛 확인이
  // 남아 있으면 그 사이 바뀐 목록 위에서 승인 버튼이 눌릴 수 있다.
  useEffect(() => {
    if (!open) kick.reset()
  }, [open, kick.reset])

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      // F-16(AC-01): 열린 상태에서 실제로 닫는 경로만 취소음.
      dispatchUiSfx("ui-cancel", event)
      onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!mounted || !open) return null

  return createPortal(
    <div className={INGAME_KICK_PLAYER_MODAL_SHELL_CLASS} role="presentation">
      <button
        type="button"
        aria-label={INGAME_KICK_PLAYER_MODAL_COPY.closeAriaLabel}
        className={INGAME_KICK_PLAYER_MODAL_BACKDROP_CLASS}
        data-sfx-kind="ui-cancel"
        onClick={onClose}
      />

      <div className={INGAME_KICK_PLAYER_MODAL_WRAP_CLASS}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={INGAME_KICK_PLAYER_MODAL_COPY.title}
          className={`${INGAME_KICK_PLAYER_MODAL_INNER_CLASS} pointer-events-auto`}
          style={getInGameKickPlayerPanelStyle()}
          onClick={(event) => event.stopPropagation()}
        >
          <PublicAsset
            src={INGAME_KICK_PLAYER_MODAL_ASSETS.panelFrame}
            alt=""
            className={INGAME_KICK_PLAYER_MODAL_FRAME_IMAGE_CLASS}
          />

          <h2 className={INGAME_KICK_PLAYER_MODAL_TITLE_CLASS}>
            {INGAME_KICK_PLAYER_MODAL_COPY.title}
          </h2>

          <button
            type="button"
            aria-label={INGAME_KICK_PLAYER_MODAL_COPY.closeAriaLabel}
            onClick={onClose}
            data-sfx-kind="ui-cancel"
            className={INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_CLASS}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={INGAME_KICK_PLAYER_MODAL_ASSETS.closeButton}
              alt=""
              className={INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_IMG_CLASS}
            />
          </button>

          <div
            className="absolute inset-0 z-[2] flex min-h-0 flex-col"
            style={INGAME_KICK_PLAYER_MODAL_INSET}
          >
            <SettingKickPlayerModalContent
              targets={targets}
              pendingTarget={kick.pendingTarget}
              status={kick.status}
              errorCode={kick.errorCode}
              isSending={kick.isSending}
              canLookupResult={kick.canLookupResult}
              onRequestConfirm={kick.requestConfirm}
              onCancelConfirm={kick.cancelConfirm}
              onConfirmKick={kick.confirmKick}
              onLookupResult={kick.lookupResult}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
