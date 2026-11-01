// 방 코드 창: 데스크톱 방코드 발송 틀 그림(제목·안내 글 들어 있음) 위 6칸 코드 + 복사 버튼 + 복사 실패 글
// SettingsSheet가 씀, 복사 상태는 데스크톱 useRoomCodeCopy, 그림·움직임은 데스크톱 RoomCodeViewModal 그대로
import { useId } from "react"
import { GAME_MATCHING_ASSETS } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { FRAME_VARIANTS, POPUP_CLOSE_BUTTON } from "@/domains/game/matching/constants/roomCodeViewModal.js"
import { useRoomCodeCopy } from "@/domains/game/matching/hooks/useRoomCodeCopy.js"
import { ROOM_INVITE_ASSETS } from "@/domains/game/mode/constants/roomInviteAssets.js"
import { FOOTER_INSET, INPUT_INSET } from "@/domains/game/shared/constants/roomCodeFrameStyles.js"
import {
  ROOM_CODE_COPY_ERRORS,
  ROOM_CODE_COPY_RESULTS,
  ROOM_CODE_LENGTH,
  isValidRoomCode,
  normalizeRoomCode,
} from "@/domains/game/shared/utils/roomCode.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import Modal from "@m/shared/ui/modal/Modal.jsx"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { SHEET_BUTTON_LOOK } from "../parts/buttonLook.js"

// 코드 한 칸 글자 (그림 칸 자리에 맞춤, 데스크톱 RoomCodeInput과 같은 여백·글꼴)
const CELL_CLASS =
  "flex aspect-square h-[92%] w-[13%] items-center justify-center font-subheading text-[min(6vw,2.1rem)] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]"

// 방 코드 창 (roomCode는 판 상태 값)
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
    <Modal
      open={open}
      onClose={handleClose}
      closeLabel="방코드 보기 닫기"
      ariaLabel="방코드"
      backdropClassName="bg-black/60"
      variants={FRAME_VARIANTS}
      testId="room-code-sheet"
      className="w-[min(calc(100vw-1.5rem),52rem)] land:w-[min(calc(100vw-1.5rem),30rem)]"
    >
      <div className="relative w-full">
        <PublicAsset
          src={GAME_MATCHING_ASSETS.roomCodeShareFrame}
          alt="초대 방코드"
          className="pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        />
        <button
          type="button"
          aria-label="방코드 팝업 닫기"
          onClick={handleClose}
          data-sfx-kind="ui-cancel"
          className="absolute -right-1 top-[4.2%] z-20 flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-95"
        >
          <PublicAsset src={POPUP_CLOSE_BUTTON} alt="" className="block h-10 w-10 select-none object-contain" />
        </button>

        <div className="absolute z-10" style={INPUT_INSET}>
          <div
            className="flex h-full w-full items-center justify-between pl-[8.6%] pr-[7.8%]"
            role="group"
            aria-label={`방코드 ${displayRoomCode || "없음"}`}
          >
            {cells.map((char, i) => (
              <span key={i} className={CELL_CLASS} aria-hidden="true">{char}</span>
            ))}
          </div>
        </div>

        {/* 복사 버튼은 틀 아래쪽 칸 (데스크톱 footer 자리) */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center" style={FOOTER_INSET}>
          <ImageButton
            look={SHEET_BUTTON_LOOK}
            label={copied ? "복사됨" : "방코드 복사"}
            ariaLabel={copied ? "방코드 복사됨" : "방코드 복사"}
            src={ROOM_INVITE_ASSETS.joinButton}
            onClick={handleCopy}
            disabled={!canCopy}
            aria-describedby={errorText ? copyErrorId : undefined}
            className="h-11 w-[min(46%,15.25rem)]"
          />
        </div>
      </div>
      {/* 복사 실패 글은 틀이 작은 폰에서 칸을 가리지 않게 틀 아래 */}
      <p
        id={copyErrorId}
        role="alert"
        data-copy-status={copyStatus || (canCopy ? "" : ROOM_CODE_COPY_RESULTS.CODE_UNAVAILABLE)}
        className="mt-2 min-h-[1.25rem] text-center font-subheading app-text-scaled [--app-text-size:0.9rem] font-semibold leading-snug text-[#ffb3a7] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
      >
        {errorText}
      </p>
    </Modal>
  )
}
