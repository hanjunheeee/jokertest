// 방코드 화면 바닥 고정 줄: 취소·참여하기
// RoomInvitePage가 씀, 데스크톱은 틀 안에 있던 버튼을 폰에선 엄지 닿는 바닥으로 옮김
import { ROOM_INVITE_ASSETS } from "@/domains/game/mode/constants/roomInviteAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"

// 취소·참여 바닥 줄
export default function CodeActions({ onCancel, onJoin }) {
  return (
    <ShellBottom>
      <div className="flex justify-center gap-3 bg-gradient-to-t from-black/95 to-black/60 px-4 py-2">
        <ImageButton
          look="plate"
          src={ROOM_INVITE_ASSETS.cancelButton}
          label="취소"
          sfxKind="ui-cancel"
          onClick={onCancel}
          className="w-[min(46%,12rem)]"
        />
        <ImageButton
          look="plate"
          src={ROOM_INVITE_ASSETS.joinButton}
          label="참여하기"
          onClick={onJoin}
          className="w-[min(46%,12rem)]"
        />
      </div>
    </ShellBottom>
  )
}
