// 직업 도전과제 목록 (받은 과제는 클리어 줄, 아니면 이름·진행도·보상) + 테두리 크게 보기 창
// guests/InvitedGuestsView.jsx가 뒷면 아래쪽에 씀
import { useState } from "react"
import BorderZoomModal from "@m/domains/library/components/guests/BorderZoomModal.jsx"
import ChallengeRewards from "@m/domains/library/components/guests/ChallengeRewards.jsx"
import {
  INK_SOFT_CLASS,
  SMALL_TEXT_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_CLASS,
} from "@m/domains/library/constants/libraryStyle.js"

// 진행 숫자 둘 다 있을 때만 (현재/목표), 현재는 목표 넘지 않게 (데스크톱과 같음)
function progressText(current, threshold) {
  if (typeof current !== "number" || typeof threshold !== "number") return ""
  return ` (${Math.min(current, threshold)}/${threshold})`
}

// 알림으로 들어온 과제 줄은 data·aria-current 표시 (데스크톱과 같은 이름표)
export default function ChallengeList({ challenges, targetAchievementId = null }) {
  const [zoomItem, setZoomItem] = useState(null)

  return (
    <section className="flex flex-col">
      <div className={`flex justify-between pb-1.5 ${TABLE_HEAD_ROW_CLASS}`}>
        <span>도전과제</span>
        <span>보상</span>
      </div>
      <ul className={`m-0 list-none p-0 ${SMALL_TEXT_CLASS}`}>
        {challenges.map((challenge) => {
          const targeted = targetAchievementId !== null && challenge.id === targetAchievementId
          return (
            <li
              key={challenge.id}
              className={`${TABLE_ROW_CLASS} py-2`}
              data-achievement-id={challenge.id}
              data-notification-target={targeted ? "true" : undefined}
              aria-current={targeted ? "true" : undefined}
            >
              {challenge.cleared ? (
                <p className={`m-0 text-center font-semibold ${INK_SOFT_CLASS}`}>-- 도전과제 클리어 --</p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 font-semibold leading-snug">
                    {challenge.label}
                    {progressText(challenge.current, challenge.threshold)}
                  </span>
                  <div className="ml-auto">
                    <ChallengeRewards rewards={challenge.rewards} onOpenBorder={setZoomItem} />
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <BorderZoomModal item={zoomItem} onClose={() => setZoomItem(null)} />
    </section>
  )
}
