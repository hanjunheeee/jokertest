/**
 * 방코드 양피지 프레임 레이아웃 셸 (prototype: 방코드 입력 프레임.png)
 * RoomInvitePage(입력·취소·참여), RoomCodeViewModal(읽기 전용·복사)에서 공통 사용
 *
 * props
 * - value, onChange: RoomCodeInput에 전달할 방 코드 문자열(최대 6자)
 * - readOnly: true면 입력만 표시 (모달 방코드 보기)
 * - autoFocus: 마운트 후 첫 칸 포커스
 * - disabled: 입력 비활성화
 * - frameSrc: 프레임 PNG 경로 (기본: 방코드 입력 프레임)
 * - footer: 하단 버튼 영역 슬롯 (취소·참여, 복사 등)
 * - overlay: 프레임 위에 겹칠 UI (모달 닫기 버튼 등)
 * - className: 루트 wrapper 클래스
 *
 * inset·스타일은 constants/roomCodeFrameStyles.js, 에셋은 roomInviteAssets.js 참고
 */
import { ROOM_INVITE_ASSETS } from "../constants/roomInviteAssets.js"
import {
  ROOM_CODE_FRAME_FOOTER_INSET,
  ROOM_CODE_FRAME_IMAGE_CLASS,
  ROOM_CODE_FRAME_INPUT_INSET,
} from "../constants/roomCodeFrameStyles.js"
import RoomCodeInput from "./RoomCodeInput.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

/** 프레임 PNG + 중앙 입력 + 하단 footer 슬롯을 배치하는 방코드 UI 프레임 */
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
      <PublicAsset
        src={frameSrc}
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
