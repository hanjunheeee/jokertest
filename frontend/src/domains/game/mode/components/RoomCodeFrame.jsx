import { ROOM_INVITE_ASSETS } from "../constants/roomInviteAssets.js"
import {
  ROOM_CODE_FRAME_FOOTER_INSET,
  ROOM_CODE_FRAME_IMAGE_CLASS,
  ROOM_CODE_FRAME_INPUT_INSET,
} from "../constants/roomCodeFrameStyles.js"
import RoomCodeInput from "./RoomCodeInput.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

/**
 * prototype 방코드 입력 프레임.png
 * - 프레임 PNG + 6칸 입력 슬롯 + 하단 버튼 영역
 */
export default function RoomCodeFrame({
  value,
  onChange,
  readOnly = false,
  autoFocus = false,
  disabled = false,
  frameAlt = "방코드 입력",
  footer,
  overlay = null,
  className = "relative w-full",
}) {
  return (
    <div className={className}>
      <PublicAsset
        src={ROOM_INVITE_ASSETS.inputFrame}
        alt={frameAlt}
        className={ROOM_CODE_FRAME_IMAGE_CLASS}
      />

      {overlay}

      <div
        className="absolute z-10 flex items-center justify-center"
        style={ROOM_CODE_FRAME_INPUT_INSET}
      >
        <RoomCodeInput
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          autoFocus={autoFocus}
          disabled={disabled}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end"
        style={ROOM_CODE_FRAME_FOOTER_INSET}
      >
        {footer}
      </div>
    </div>
  )
}
