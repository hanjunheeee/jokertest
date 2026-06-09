import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const ROW_ACTION_BTN_CLASS =
  "block w-[clamp(1.85rem,2.8vw,2.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export default function RecommendedFriendRow({ name, profileSrc, online }) {
  return (
    <li className="relative mt-2 w-full list-none">
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className="block h-auto w-full select-none"
      />
      <div className="absolute inset-0 flex items-center justify-between gap-1 px-[6%] py-[6%]">
        <div className="flex min-w-0 max-w-[58%] items-center gap-2">
          <div className="relative size-[2.65rem] shrink-0">
            <PublicAsset
              src={FRIEND_LIST_ASSETS.profileFrame}
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

          <div className="min-w-0">
            <p className="truncate font-subheading text-[clamp(0.78rem,1vw,0.92rem)] leading-tight text-white">
              {name}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="relative inline-flex h-[1.05rem] w-[1.05rem] shrink-0">
                <PublicAsset
                  src={FRIEND_LIST_ASSETS.onlineBadge}
                  alt=""
                  className="h-full w-full select-none"
                />
                {!online ? (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full bg-black/80"
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <span
                className={`text-[9px] leading-none ${
                  online ? "text-amber-100/85" : "text-white/35"
                }`}
              >
                {online ? "접속 중" : "오프라인"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-[clamp(0.2rem,0.45vw,0.35rem)]">
          <button
            type="button"
            className={ROW_ACTION_BTN_CLASS}
            aria-label={`${name} 차단`}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.friendBlockButton}
              alt=""
              className="block h-auto w-full select-none"
            />
          </button>
          <button
            type="button"
            className={ROW_ACTION_BTN_CLASS}
            aria-label={`${name}에게 친구 신청`}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.friendRequestButton}
              alt=""
              className="block h-auto w-full select-none"
            />
          </button>
        </div>
      </div>
    </li>
  )
}
