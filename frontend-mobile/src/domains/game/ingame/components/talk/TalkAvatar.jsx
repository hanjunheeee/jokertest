// 채팅방 초상: 프로필 사진 + 프로필 프레임(전적 목록과 같은 장비), 죽거나 끊기면 흐리게
// TalkBubble이 말·이모티콘 묶음 첫 줄에서 씀 (내 말·남 말)
import { resolvePlayerRecordListProfileAssets } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import { INGAME_PLAYER_STATUS } from "@/domains/game/shared/constants/ingamePlayerStatus.js"
import Portrait from "@m/domains/game/ingame/components/sheets/parts/Portrait.jsx"
import { AVATAR_SIZE_CLASS } from "./talkStyle.js"

export default function TalkAvatar({ player, playerIndex = 0 }) {
    const dim = player && player.status !== INGAME_PLAYER_STATUS.ALIVE
    const profile = resolvePlayerRecordListProfileAssets(player ?? {}, playerIndex)
    return (
        <div
            className={`shrink-0 select-none ${dim ? "opacity-50 grayscale" : ""}`.trim()}
            aria-hidden
        >
            <Portrait
                photoSrc={profile.profilePhotoSrc}
                frameSrc={profile.profileBorderSrc}
                className={AVATAR_SIZE_CLASS}
            />
        </div>
    )
}
