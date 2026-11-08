// 채팅방 초상: 둥근 얼굴 사진 + 플레이어 테마 색 테두리, 죽거나 끊기면 흐리게
// TalkBubble·EmojiTalk가 남의 말 묶음 첫 줄에 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_PLAYER_STATUS } from "@/domains/game/shared/constants/ingamePlayerStatus.js"
import { AVATAR_SIZE_CLASS } from "./talkStyle.js"

export default function TalkAvatar({ player, themeColor }) {
    const dim = player && player.status !== INGAME_PLAYER_STATUS.ALIVE
    return (
        <div
            className={`${AVATAR_SIZE_CLASS} relative shrink-0 overflow-hidden rounded-full border-2 bg-[#2a140a] ${dim ? "opacity-50 grayscale" : ""}`.trim()}
            style={{ borderColor: themeColor ?? "#b08a4a" }}
            aria-hidden
        >
            {player?.portraitSrc ? (
                <PublicAsset src={player.portraitSrc} alt="" className="block h-full w-full scale-[1.35] select-none object-cover object-[50%_18%]" />
            ) : null}
        </div>
    )
}
