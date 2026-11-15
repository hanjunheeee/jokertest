// 추방 창 내용: 안내 글·결과 글(실패·모름·다시 확인 중)·대상 목록, 줄의 "추방"을 누르면 바로 보냄
// 대기방 추방 창(GameMatchingPage)이 사용 (판 안 추방 창은 기능을 빼며 지움)
import { useRef } from "react"
import { resolvePlayerRecordListProfileAssets } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import {
  INGAME_KICK_PLAYER_MODAL_COPY,
  resolveKickErrorMessage,
} from "../../../constants/controls/kickPlayer/ingameKickPlayerData.js"
import {
  MODAL_NOTICE_CLASS,
  MODAL_SCROLL_CLASS,
  MODAL_SCROLL_WRAP_CLASS,
  MODAL_SUBTITLE_CLASS,
} from "../../../constants/controls/kickPlayer/ingameKickPlayerLayout.js"
import { KICK_REQUEST_STATUS } from "../../../constants/ingameKick.js"
import { INGAME_FOCUS_RING_CLASS } from "../../../constants/ingameFocusRing.js"
import SettingKickPlayerRow from "./SettingKickPlayerRow.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

// 결과 글 칸: 창 안쪽이 거의 검정이라 글자색·바탕색을 꼭 정함 (안 정하면 기본 검정 글자가 안 보임)
const RESULT_BOX_CLASS =
  "mb-[clamp(0.4rem,1.2cqi,0.6rem)] shrink-0 rounded-sm border px-[clamp(0.45rem,1.6cqi,0.65rem)] py-[clamp(0.3rem,1cqi,0.45rem)] text-center font-subheading text-[clamp(0.62rem,2.1cqi,0.78rem)] font-bold leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
const ERROR_BOX_CLASS = `${RESULT_BOX_CLASS} border-[#b50000]/60 bg-[#3a1410]/90 text-[#ffc9bf]`
const NOTE_BOX_CLASS = `${RESULT_BOX_CLASS} border-[#3a2818]/70 bg-[#120a06]/85 text-[#f5f0e6]`
const LOOKUP_BTN_CLASS =
  `mb-[clamp(0.4rem,1.2cqi,0.6rem)] min-h-[2.25rem] shrink-0 cursor-pointer self-center rounded-sm border border-[#c9b892]/60 bg-[#2a1a10] px-[clamp(0.6rem,2cqi,0.9rem)] font-subheading text-[clamp(0.62rem,2.1cqi,0.78rem)] font-bold text-[#f5f0e6] ${INGAME_FOCUS_RING_CLASS}`

// 추방 진행 값은 부르는 쪽 훅에서 받아 그리기만 함
export default function SettingKickPlayerModalContent({
  targets = [],
  pendingTarget = null,
  status = KICK_REQUEST_STATUS.IDLE,
  errorCode = null,
  isSending = false,
  canLookupResult = false,
  isAwaitingResolution = false,
  onRequestConfirm,
  onLookupResult,
  getThemeStylesByPlayerId = null,
  getProfileAssetsByPlayerId = null,
}) {
  const scrollRef = useRef(null)

  // 줄의 "추방"을 누르면 바로 보냄 (onRequestConfirm은 옛 이름, 확인 칸 없음), 보내는 줄은 "보내는 중"
  // 실패·결과 모름이면 오류 글, 결과 묻기 버튼은 결과를 모를 때만(영수증 남은 동안)
  // 목록 다시 확인 중이면 새로 못 누른다는 안내
  // 프로필 그림은 그 사람 것 (부르는 쪽이 주거나 대상 값), 없을 때만 줄 순서 기본 그림
  return (
    <>
      <p className={MODAL_SUBTITLE_CLASS}>
        {INGAME_KICK_PLAYER_MODAL_COPY.subtitle}
      </p>
      <p className={MODAL_NOTICE_CLASS}>{INGAME_KICK_PLAYER_MODAL_COPY.notice}</p>

      {status === KICK_REQUEST_STATUS.FAILED ? (
        <p role="alert" data-testid="kick-error" data-kick-error-code={errorCode ?? ""} className={ERROR_BOX_CLASS}>
          {resolveKickErrorMessage(errorCode)}
        </p>
      ) : null}
      {status === KICK_REQUEST_STATUS.UNKNOWN ? (
        <p role="alert" data-testid="kick-unknown" className={ERROR_BOX_CLASS}>
          {INGAME_KICK_PLAYER_MODAL_COPY.unknownResult}
        </p>
      ) : null}
      {canLookupResult && status !== KICK_REQUEST_STATUS.SUCCEEDED && status !== KICK_REQUEST_STATUS.SENDING ? (
        <button
          type="button"
          data-testid="kick-lookup-result"
          className={LOOKUP_BTN_CLASS}
          onClick={() => onLookupResult?.()}
        >
          {INGAME_KICK_PLAYER_MODAL_COPY.lookupResultLabel}
        </button>
      ) : null}
      {isAwaitingResolution ? (
        <p role="status" data-testid="kick-awaiting-resolution" className={NOTE_BOX_CLASS}>
          {INGAME_KICK_PLAYER_MODAL_COPY.awaitingResolution}
        </p>
      ) : null}

      {targets.length === 0 ? (
        <p role="status" data-testid="kick-empty-targets" className={NOTE_BOX_CLASS}>
          {INGAME_KICK_PLAYER_MODAL_COPY.emptyTargets}
        </p>
      ) : null}

      <div className={MODAL_SCROLL_WRAP_CLASS}>
        <ul
          ref={scrollRef}
          className={MODAL_SCROLL_CLASS}
          aria-label={INGAME_KICK_PLAYER_MODAL_COPY.listAriaLabel}
        >
          {targets.map((player, index) => {
            const { profilePhotoSrc, profileBorderSrc } =
              getProfileAssetsByPlayerId?.(player.uuid) ?? resolvePlayerRecordListProfileAssets(player, index)
            // 소속 id가 둘 다 있을 때만 그걸로, 없으면 uuid로 (null끼리 같다고 여러 줄이 함께 "보내는 중"이 되지 않게)
            const isPending = Boolean(pendingTarget) && (
              pendingTarget.membershipId && player.membershipId
                ? pendingTarget.membershipId === player.membershipId
                : pendingTarget.uuid === player.uuid
            )

            return (
              <SettingKickPlayerRow
                key={player.membershipId ?? player.uuid}
                playerId={player.uuid}
                name={player.nickname}
                profilePhotoSrc={profilePhotoSrc}
                profileBorderSrc={profileBorderSrc}
                isPending={isPending}
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
