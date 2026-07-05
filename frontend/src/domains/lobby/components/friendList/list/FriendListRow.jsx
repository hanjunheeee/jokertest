/**
 * 친구 목록 행.
 *
 * 친구 한 명의 프로필, 접속 상태, 즐겨찾기 상태를 표시합니다.
 */
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// name: 친구 닉네임, profileSrc: 프로필 이미지 경로
// online: 접속 중 여부 — 배지 색과 "접속 중"/"오프라인" 텍스트를 결정
export default function FriendListRow({ name, profileSrc, online }) {
  return (
    <li className="relative mt-2 w-full list-none">
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className="block h-auto w-full select-none"
      />
      <div className="absolute inset-0 flex items-center gap-2 px-[7%] py-[6%]">
        <PublicAsset
          src={profileSrc}
          alt=""
          className="h-auto w-[clamp(2.35rem,26%,3.1rem)] shrink-0 select-none"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-subheading text-[clamp(0.8rem,1.05vw,0.95rem)] leading-tight text-white">
            {name}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="relative inline-flex h-[1.15rem] w-[1.15rem] shrink-0">
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
              className={`text-[10px] leading-none ${
                online ? "text-amber-100/85" : "text-white/35"
              }`}
            >
              {online ? "접속 중" : "오프라인"}
            </span>
          </div>
        </div>
      </div>
    </li>
  )
}
