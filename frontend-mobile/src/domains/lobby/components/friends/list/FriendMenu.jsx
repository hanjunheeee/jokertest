// 친구 줄을 누르면 뜨는 동작 메뉴 (즐겨찾기·게임 초대·차단·닫기)
// ListTab이 고른 친구가 있을 때 시트 바닥에 그림
import { useFriendStore } from "@/domains/lobby/store/friend.store.js"
import { useGameInviteStore } from "@/domains/lobby/store/gameInvite.store.js"
import { DETAIL_MUTED_CLASS, TEXT_BUTTON_CLASS } from "../sheetStyle.js"

// 데스크톱 줄의 별·초대·차단 버튼을 한 메뉴로 모음, 데스크톱 title 설명은 폰에서 안 보여 글자로 보임
export default function FriendMenu({ friend, invite, block, onClose }) {
  const { id, name } = friend
  const isFavorite = useFriendStore((state) => state.favoriteFriendIds.has(id))
  const saving = useFriendStore((state) => state.favoritePendingIds.has(id))
  const setFavorite = useFriendStore((state) => state.setFavorite)
  const sending = useGameInviteStore((state) => state.sendingReceiverIds.has(id))
  const blocking = block.blockingIds.has(id)

  // 누르면 처리 시작하고 메뉴는 닫음 (결과·오류는 줄에 보임)
  const runAndClose = (action) => () => {
    action()
    onClose()
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end">
      <button type="button" aria-label="메뉴 닫기" onClick={onClose} className="absolute inset-0 border-0 bg-black/55 p-0" />
      <div
        role="menu"
        aria-label={`${name} 메뉴`}
        className="relative flex flex-col gap-2 rounded-t-lg border border-white/20 bg-[#1b1410]/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <p className="truncate text-center font-subheading app-text-scaled [--app-text-size:16px] font-bold text-[#ebe2cc]">{name}</p>
        <button type="button" role="menuitem" disabled={saving} className={TEXT_BUTTON_CLASS}
          onClick={runAndClose(() => setFavorite(id, !isFavorite))}>
          {isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        </button>
        {/* 방 id가 있는 곳(대기방)에서만 초대 칸, 로비는 늘 없음 */}
        {invite !== null ? (
          <>
            <button type="button" role="menuitem" disabled={invite.disabled || sending} className={TEXT_BUTTON_CLASS}
              data-invite-target={id} onClick={runAndClose(() => invite.onInvite(id))}>
              {sending ? "초대 보내는 중…" : "게임 초대"}
            </button>
            {invite.disabled ? <p className={`text-center ${DETAIL_MUTED_CLASS}`}>{invite.disabledReason}</p> : null}
          </>
        ) : null}
        <button type="button" role="menuitem" disabled={blocking} className={`${TEXT_BUTTON_CLASS} text-red-200`}
          data-block-friend={id} onClick={runAndClose(() => block.onBlock(id))}>
          {blocking ? "차단 처리 중…" : "차단"}
        </button>
        <p className={`text-center ${DETAIL_MUTED_CLASS}`}>차단하면 앞으로 신청·초대를 양쪽 모두 막습니다(친구 관계는 남습니다).</p>
        <button type="button" role="menuitem" onClick={onClose} className={TEXT_BUTTON_CLASS}>닫기</button>
      </div>
    </div>
  )
}
