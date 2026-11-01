// 게임 시작 막힘 안내 시트: 제목·사유·확인 버튼
// GameMatchingPage가 씀, 데스크톱 GameStartBlockedModal(양피지 창)과 같은 문구, 사유 있을 때만 뜸
import { BLOCKED_TITLE } from "@/domains/game/matching/constants/gameStartMessages.js"
import { BTN_ASSET, PARCHMENT_CONFIRM_LABEL } from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"
import BottomSheet from "../sheet/BottomSheet.jsx"
import ImageButton from "../common/ImageButton.jsx"

// 시작 막힘 안내 (확인·닫기 모두 문구 지움)
export default function StartBlockedSheet({ message, onClose }) {
  return (
    <BottomSheet
      open={Boolean(message)}
      onClose={onClose}
      title={BLOCKED_TITLE}
      tone="parchment"
      footer={
        <ImageButton label={PARCHMENT_CONFIRM_LABEL} src={BTN_ASSET} onClick={onClose} className="mx-auto h-12 w-[10rem]" />
      }
    >
      <div data-game-start-blocked="">
        <p
          role="alert"
          className="py-3 text-center font-subheading app-text-scaled [--app-text-size:1rem] font-semibold leading-relaxed text-[#3a1a0c]"
        >
          {message}
        </p>
      </div>
    </BottomSheet>
  )
}
