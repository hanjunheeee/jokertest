// 파일 역할: RoomCodeFrame.jsx - 화면을 구성하는 컴포넌트입니다.
import { ROOM_INVITE_ASSETS } from "@/domains/game/mode/constants/roomInviteAssets.js"
import {
  ROOM_CODE_FRAME_FOOTER_INSET,
  ROOM_CODE_FRAME_IMAGE_CLASS,
  ROOM_CODE_FRAME_INPUT_INSET,
} from "@/domains/game/mode/constants/roomCodeFrameStyles.js"
import RoomCodeInput from "@/domains/game/mode/components/RoomCodeInput.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 방코드 입력 프레임 이미지와 실제 입력칸, 하단 버튼 영역을 조합합니다.
export default function RoomCodeFrame({
  value,
  onChange,
  readOnly = false,
  autoFocus = false,
  disabled = false,
  frameAlt = "방코드 입력",
  frameSrc = ROOM_INVITE_ASSETS.inputFrame,
  footer,
  overlay = null,
  className = "relative w-full",
}) {
  return (
    <div className={className}>
      <PublicAsset src={frameSrc} alt={frameAlt} className={ROOM_CODE_FRAME_IMAGE_CLASS} />
      {overlay}
      <div className="absolute z-10 flex items-center justify-center" style={ROOM_CODE_FRAME_INPUT_INSET}>
        <RoomCodeInput
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          autoFocus={autoFocus}
          disabled={disabled}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end" style={ROOM_CODE_FRAME_FOOTER_INSET}>
        {footer}
      </div>
    </div>
  )
}
