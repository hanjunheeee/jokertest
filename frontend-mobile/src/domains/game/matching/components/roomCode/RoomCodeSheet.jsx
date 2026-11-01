// 방코드 시트: 6칸 코드 + 복사 버튼 + 복사 실패 문구
// GameMatchingPage가 씀, 복사 상태는 데스크톱 useRoomCodeCopy 그대로 (RoomCodeViewModal과 같은 규칙)
import { useId } from "react"
import { GAME_MATCHING_ASSETS } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { useRoomCodeCopy } from "@/domains/game/matching/hooks/useRoomCodeCopy.js"
import {
  ROOM_CODE_COPY_ERRORS,
  ROOM_CODE_COPY_RESULTS,
  ROOM_CODE_LENGTH,
  isValidRoomCode,
  normalizeRoomCode,
} from "@/domains/game/shared/utils/roomCode.js"
import BottomSheet from "../sheet/BottomSheet.jsx"
import ImageButton from "../common/ImageButton.jsx"
import { ERROR_ON_PARCHMENT_CLASS, ROOM_CODE_COPY } from "../../constants/matchingMobileStyles.js"

// 코드 한 칸 모양 (데스크톱 방코드 틀의 어두운 칸 느낌)
const CELL_CLASS =
  "flex aspect-[4/5] min-w-0 flex-1 items-center justify-center rounded-md border-2 border-[#1d1611] bg-[#2b2520] font-display app-text-scaled [--app-text-size:1.7rem] font-bold text-[#f5f0e6] shadow-[inset_0_2px_6px_rgba(0,0,0,0.7)] land:aspect-auto land:h-12"

// 방코드 시트
export default function RoomCodeSheet({ open, onClose, roomCode }) {
  const copyErrorId = useId()
  // 표시값은 정규화한 코드, 형식이 맞을 때만 복사 가능
  const displayRoomCode = normalizeRoomCode(roomCode)
  const canCopy = isValidRoomCode(displayRoomCode)
  const { copied, copyError, copyStatus, handleClose, handleCopy } =
    useRoomCodeCopy({ open, displayRoomCode, onClose })

  // 코드 없으면 빈 칸 6개
  const cells = Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => displayRoomCode[i] ?? "")
  const errorText = copyError || (canCopy ? "" : ROOM_CODE_COPY_ERRORS.UNAVAILABLE)

  return (
    <BottomSheet open={open} onClose={handleClose} title={ROOM_CODE_COPY.title} tone="parchment" closeLabel="방코드 팝업 닫기">
      <div className="flex flex-col items-center gap-3 pt-1 pb-2" data-copy-status={copyStatus || undefined}>
        <p className="text-center font-subheading app-text-scaled [--app-text-size:0.92rem] font-semibold leading-snug text-[#2a1810]">
          {ROOM_CODE_COPY.description}
        </p>

        <div className="flex w-full max-w-[22rem] gap-1.5" role="group" aria-label={`방코드 ${displayRoomCode || "없음"}`}>
          {cells.map((char, i) => (
            <span key={i} className={CELL_CLASS} aria-hidden="true">{char}</span>
          ))}
        </div>

        <ImageButton
          label={copied ? ROOM_CODE_COPY.copied : ROOM_CODE_COPY.copy}
          ariaLabel={copied ? "방코드 복사됨" : "방코드 복사"}
          src={GAME_MATCHING_ASSETS.startGameButton}
          onClick={handleCopy}
          disabled={!canCopy}
          describedBy={errorText ? copyErrorId : undefined}
          className="h-12 w-[12rem]"
        />
        <p
          id={copyErrorId}
          role="alert"
          data-copy-status={copyStatus || (canCopy ? "" : ROOM_CODE_COPY_RESULTS.CODE_UNAVAILABLE)}
          className={`${ERROR_ON_PARCHMENT_CLASS} min-h-[1.25rem] text-center`}
        >
          {errorText}
        </p>
      </div>
    </BottomSheet>
  )
}
