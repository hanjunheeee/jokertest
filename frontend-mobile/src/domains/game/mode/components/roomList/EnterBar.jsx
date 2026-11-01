// 방 목록 바닥 고정 줄: 입장하기 버튼 (고른 방·입장 중·마감·코드 방에 따라 글자·잠금)
// MultiplayEntryPage가 씀, ShellBottom으로 화면 틀 바닥 자리에 들어감
import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"

// 입장 바닥 줄
export default function EnterBar({ label, disabled, onEnter }) {
  return (
    <ShellBottom>
      <div className="flex justify-center bg-gradient-to-t from-black/95 to-black/60 px-4 py-2">
        <ImageButton
          look="plate"
          src={ROOM_LIST_ASSETS.enterButton}
          label={label}
          ariaLabel={label === "입장하기" ? "선택한 방 입장" : label}
          disabled={disabled}
          onClick={onEnter}
          className="w-[min(100%,16rem)]"
          labelClassName="[--app-text-size:1.1rem]"
        />
      </div>
    </ShellBottom>
  )
}
