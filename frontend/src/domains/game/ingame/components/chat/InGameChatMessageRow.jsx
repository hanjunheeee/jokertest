import { INGAME_CHAT_ASSETS } from "../../constants/ingameChatAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/**
 * 인게임 채팅 메시지 한 줄 (프로필 아바타 + 텍스트)
 */
export default function InGameChatMessageRow({ senderName, text, profileSrc }) {
  return (
    <li className="flex min-w-0 list-none items-center gap-[0.4em]">
      <div className="relative mt-[0.08em] size-[clamp(1.45rem,9.2cqi,1.9rem)] shrink-0">
        <PublicAsset
          src={INGAME_CHAT_ASSETS.profileFrame}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
        />
        <div className="absolute inset-[22%] overflow-hidden">
          <PublicAsset
            src={profileSrc}
            alt=""
            className="block h-full w-full select-none object-cover object-center"
          />
        </div>
      </div>

      <p className="mt-[clamp(0.08rem,0.55cqi,0.15rem)] min-w-0 flex-1 whitespace-nowrap font-subheading text-[clamp(0.56rem,2.55cqi,0.74rem)] font-bold leading-none text-[#3a1a0c]">
        <span>{senderName}:</span>{" "}
        <span>&quot;{text}&quot;</span>
      </p>
    </li>
  )
}
