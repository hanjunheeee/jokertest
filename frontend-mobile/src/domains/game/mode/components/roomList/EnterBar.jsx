// 방 목록 판 안 입장하기 (쪽 넘기기 아래)
// MultiplayEntryPage가 RoomCardList footer에 넣음
import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"

// 입장 버튼
export default function EnterBar({ label, disabled, onEnter }) {
  return (
    <div className="flex items-center justify-center px-1 pb-1 pt-2">
      <ImageButton
        look="plate"
        src={ROOM_LIST_ASSETS.enterButton}
        label={label}
        ariaLabel={label === "입장하기" ? "선택한 방 입장" : label}
        disabled={disabled}
        onClick={onEnter}
        className="w-[9.75rem] max-w-full shrink-0"
        labelClassName="[--app-text-size:0.88rem]"
      />
    </div>
  )
}