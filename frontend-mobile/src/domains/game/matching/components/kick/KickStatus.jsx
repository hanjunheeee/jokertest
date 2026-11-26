// 추방 진행 표시: 실패·결과 모름 글, 결과 확인 단추, 목록 다시 확인 중 안내
// KickSheet가 사용, 표시 조건·test id는 데스크톱 SettingKickPlayerModalContent와 같음
import { KICK_REQUEST_STATUS } from "@/domains/game/ingame/constants/ingameKick.js"
import {
  INGAME_KICK_PLAYER_MODAL_COPY as COPY,
  resolveKickErrorMessage,
} from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { ERROR_CLASS, NOTE_CLASS } from "../../constants/voteFrameStyle.js"

// 추방 진행 상태 표시 묶음
export default function KickStatus({
  status = KICK_REQUEST_STATUS.IDLE,
  errorCode = null,
  canLookupResult = false,
  isAwaitingResolution = false,
  onLookupResult,
}) {
  return (
    <>
      {status === KICK_REQUEST_STATUS.FAILED ? (
        <p role="alert" data-testid="kick-error" data-kick-error-code={errorCode ?? ""} className={ERROR_CLASS}>
          {resolveKickErrorMessage(errorCode)}
        </p>
      ) : null}
      {status === KICK_REQUEST_STATUS.UNKNOWN ? (
        <p role="alert" data-testid="kick-unknown" className={ERROR_CLASS}>
          {COPY.unknownResult}
        </p>
      ) : null}
      {/* 결과 묻기 단추는 보내는 중·성공 뒤엔 숨기고 결과를 모를 때만 표시함 */}
      {canLookupResult && status !== KICK_REQUEST_STATUS.SUCCEEDED && status !== KICK_REQUEST_STATUS.SENDING ? (
        <button
          type="button"
          data-testid="kick-lookup-result"
          onClick={() => onLookupResult?.()}
          className="my-1 min-h-11 cursor-pointer self-center rounded border border-[#c9b892]/60 bg-[#2a1a10] px-3 font-subheading font-bold text-[#f5f0e6]"
        >
          {COPY.lookupResultLabel}
        </button>
      ) : null}
      {isAwaitingResolution ? (
        <p role="status" data-testid="kick-awaiting-resolution" className={`${NOTE_CLASS} text-[#e6dcc8]`}>
          {COPY.awaitingResolution}
        </p>
      ) : null}
    </>
  )
}
