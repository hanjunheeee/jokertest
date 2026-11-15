// 추방 진행 표시: 실패/결과 모름 글·결과 확인 버튼·다시 확인 중 안내 (확인 칸 없음, 누르면 바로 보냄)
// KickSheet가 씀, 글·표시 조건·test id는 데스크톱 SettingKickPlayerModalContent와 같음
import { KICK_REQUEST_STATUS } from "@/domains/game/ingame/constants/ingameKick.js"
import {
  INGAME_KICK_PLAYER_MODAL_COPY as COPY,
  resolveKickErrorMessage,
} from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
import { ERROR_CLASS, NOTE_CLASS } from "../../constants/voteFrameStyle.js"

// 진행 표시 묶음 (값은 useMatchingRoomKick에서 받아 그리기만 함)
export default function KickStatus({ status, errorCode, canLookupResult, isAwaitingResolution, onLookupResult }) {
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
      {/* 결과 묻기 버튼은 결과를 모를 때만 (영수증 남은 동안, 보내는 중·성공 땐 안 보임) */}
      {canLookupResult && status !== KICK_REQUEST_STATUS.SUCCEEDED && status !== KICK_REQUEST_STATUS.SENDING ? (
        <button
          type="button"
          data-testid="kick-lookup-result"
          onClick={() => onLookupResult?.()}
          className="my-1 min-h-11 cursor-pointer rounded border border-[#c9b892]/60 bg-transparent px-3 font-bold text-[#f5f0e6]"
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
