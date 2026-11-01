// 방 코드 시트: 6칸 코드 + 복사 버튼 + 복사 실패 문구 (설정 시트 위에 겹쳐 뜸)
// SettingsSheet가 씀, 복사 상태는 데스크톱 useRoomCodeCopy 그대로 (RoomCodeViewModal과 같은 규칙)
import { useId } from "react"
import { INGAME_SETTING_ASSETS } from "@/domains/game/ingame/constants/controls/ingameSetting/ingameSettingAssets.js"
import { useRoomCodeCopy } from "@/domains/game/matching/hooks/useRoomCodeCopy.js"
import {
  ROOM_CODE_COPY_ERRORS,
  ROOM_CODE_COPY_RESULTS,
  ROOM_CODE_LENGTH,
  isValidRoomCode,
  normalizeRoomCode,
} from "@/domains/game/shared/utils/roomCode.js"
import Sheet from "../frame/Sheet.jsx"
import ImageButton from "../parts/ImageButton.jsx"

// 코드 한 칸 모양 (데스크톱 방코드 틀의 어두운 칸 느낌)
const CELL_CLASS =
  "flex aspect-[4/5] min-w-0 flex-1 items-center justify-center rounded-md border-2 border-[#5b4a36] bg-[#2b2520] font-display app-text-scaled [--app-text-size:1.7rem] font-bold text-[#f5f0e6] shadow-[inset_0_2px_6px_rgba(0,0,0,0.7)] land:aspect-auto land:h-12"

// 방 코드 시트 (roomCode는 판 상태 값)
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
    <Sheet open={open} onClose={handleClose} title="초대 방코드" closeLabel="방코드 팝업 닫기" layer="top" testId="room-code-sheet">
      <div className="flex flex-col items-center gap-3 pb-1">
        <p className="text-center font-subheading app-text-scaled [--app-text-size:0.9rem] leading-snug text-[#ebe2cc]/85">
          이 코드를 친구에게 알려주면 이 방에 참여할 수 있습니다.
        </p>
        <div className="flex w-full max-w-[22rem] gap-1.5" role="group" aria-label={`방코드 ${displayRoomCode || "없음"}`}>
          {cells.map((char, i) => (
            <span key={i} className={CELL_CLASS} aria-hidden="true">{char}</span>
          ))}
        </div>
        <ImageButton
          label={copied ? "복사됨" : "방코드 복사"}
          ariaLabel={copied ? "방코드 복사됨" : "방코드 복사"}
          src={INGAME_SETTING_ASSETS.tabActive}
          onClick={handleCopy}
          disabled={!canCopy}
          describedBy={errorText ? copyErrorId : undefined}
          className="h-12 w-[12rem]"
        />
        <p
          id={copyErrorId}
          role="alert"
          data-copy-status={copyStatus || (canCopy ? "" : ROOM_CODE_COPY_RESULTS.CODE_UNAVAILABLE)}
          className="min-h-[1.25rem] text-center font-subheading app-text-scaled [--app-text-size:0.85rem] font-semibold leading-snug text-[#ffb3a7]"
        >
          {errorText}
        </p>
      </div>
    </Sheet>
  )
}
