// 말풍선 한 줄: 남의 말은 왼쪽(초상 + 닉네임 + 말풍선), 내 말은 오른쪽, 이모티콘이면 말풍선 대신 큰 이모티콘
// TalkList가 말·이모티콘 줄마다 씀, 묶음 첫 줄만 초상·닉네임
// 닉네임은 테마 색 그대로 + 색에 맞는 띠 (판 채팅 줄과 같은 규칙, 남색·검붉은 테마도 어두운 채팅방에서 읽힘)
import { CHAT_NAME_BAND_CLASS, resolveChatNameBand } from "@/domains/game/ingame/utils/chatNameBand.js"
import { findInGameEmoticonItem } from "@/domains/game/ingame/utils/findInGameEmoticonItem.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import TalkAvatar from "./TalkAvatar.jsx"
import { AVATAR_SIZE_CLASS, BUBBLE_TEXT_CLASS, bubbleClass, formatTime, NAME_CLASS, TIME_CLASS } from "./talkStyle.js"

// 이모티콘 줄: 말풍선 틀 없이 그림만 크게 (카톡 이모티콘처럼)
function EmojiBody({ itemId }) {
    const item = findInGameEmoticonItem(itemId)
    if (!item) return null
    return (
        <span className="block h-16 w-16 rounded-2xl bg-black/25 p-1.5" data-talk-emoji={item.id}>
            <PublicAsset src={item.icon} alt={item.name} className="h-full w-full select-none object-contain" />
        </span>
    )
}

function Body({ line }) {
    if (line.kind === "emoji") return <EmojiBody itemId={line.itemId} />
    return <p className={`${bubbleClass(line)} ${BUBBLE_TEXT_CLASS}`}>{line.text}</p>
}

// 닉네임 글: 색이 있으면 띠 칸 안 (색 설정 끔·색 없음이면 그냥 글), 죽은 사람 줄은 회색 띠
function NameText({ name, themeColor, dead }) {
    const band = resolveChatNameBand(themeColor ? { color: themeColor } : null, true, { dead: Boolean(dead) })
    if (!band) return name
    return <span className={CHAT_NAME_BAND_CLASS} style={band.style} data-chat-name-band={band.kind}>{name}</span>
}

// groupStart: 묶음 첫 줄 (초상·닉네임 보임), player·themeColor는 참가자 정보 (없으면 기본 테두리)
export default function TalkBubble({ line, groupStart, player, themeColor, showTime }) {
    const time = showTime ? formatTime(line.at) : null
    const timeNode = time ? <span className={TIME_CLASS}>{time}</span> : null

    if (line.mine) {
        return (
            <li className={`flex justify-end gap-1.5 pl-12 ${groupStart ? "mt-2" : "mt-0.5"}`} data-talk-line="mine">
                <div className="flex min-w-0 items-end gap-1">
                    {timeNode}
                    <Body line={line} />
                </div>
            </li>
        )
    }

    return (
        <li className={`flex items-start gap-1.5 pr-10 ${groupStart ? "mt-2" : "mt-0.5"}`} data-talk-line="other">
            {groupStart ? <TalkAvatar player={player} themeColor={themeColor} /> : <span aria-hidden className={`${AVATAR_SIZE_CLASS} shrink-0`} />}
            <div className="min-w-0">
                {groupStart ? (
                    <p className={NAME_CLASS}><NameText name={line.name} themeColor={themeColor} dead={line.dead} /></p>
                ) : null}
                <div className="flex min-w-0 items-end gap-1">
                    <Body line={line} />
                    {timeNode}
                </div>
            </div>
        </li>
    )
}
