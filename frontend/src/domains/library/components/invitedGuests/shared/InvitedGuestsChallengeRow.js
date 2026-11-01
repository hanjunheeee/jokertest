// 도전과제 표 한 줄 (받은 과제는 클리어 줄, 아니면 이름·진행도·보상)
// right/InvitedGuestsJobChallenges.jsx가 씀, 시험도 직접 불러 봄
import { createElement } from "react"
import {
  CHALLENGE_CLEARED_CELL_CLASS,
  CHALLENGE_LABEL_CELL_CLASS,
  CHALLENGE_REWARD_CELL_CLASS,
  TABLE_ROW_CLASS,
} from "../../../constants/invitedGuests/tableStyle.js"
import {
  REWARD_BORDER_BTN_CLASS,
  REWARD_BORDER_ICON_CLASS,
  REWARD_BORDER_LABEL_CLASS,
  REWARD_COUNT_CLASS,
  REWARD_CURRENCY_CLASS,
  REWARD_ICON_CLASS,
  REWARD_ROW_CLASS,
} from "../../../constants/invitedGuests/layoutStyle.js"
import { publicAsset } from "../../../../../shared/utils/publicAsset.js"

// 보상 그림 못 불러오면 NFD 주소로 한 번만 다시 시도
function handleRewardIconError(event) {
  const image = event.currentTarget
  const src = image.dataset.assetSrc
  // 이 그림으로 아직 안 바꿔 봤을 때만 (계속 다시 부르기 막기)
  if (image.dataset.nfdFallbackSource !== src) {
    const normalized = src.startsWith("/") ? src : `/${src}`
    const fallbackSrc = encodeURI(normalized.normalize("NFD"))
    // 지금 주소와 같으면 바꿔도 소용없어 그대로 둠
    if (fallbackSrc !== image.getAttribute("src")) {
      image.dataset.nfdFallbackSource = src
      image.src = fallbackSrc
    }
  }
}

// 보상 그림 img, 다시 시도용으로 원래 주소를 data에 남김
function rewardIcon(reward, className) {
  return createElement("img", {
    src: publicAsset(reward.icon),
    alt: "",
    className,
    draggable: false,
    "data-asset-src": reward.icon,
    onError: handleRewardIconError,
  })
}

// 보상 칸: 재화는 아이콘·개수, 테두리는 크게 보기 버튼
function InvitedGuestsChallengeRewards({ rewards, onOpenProfileBorderZoom }) {
  return createElement(
    "div",
    { className: REWARD_ROW_CLASS },
    rewards.map((reward, index) => {
      // 재화 보상은 누를 것 없이 아이콘·개수만
      if (reward.type === "currency") {
        return createElement(
          "span",
          { key: `${reward.icon}-${index}`, className: REWARD_CURRENCY_CLASS },
          rewardIcon(reward, REWARD_ICON_CLASS),
          createElement("span", { className: REWARD_COUNT_CLASS }, `×${reward.count}`),
        )
      }

      // 그 밖(테두리)은 누르면 크게 보기 창 여는 버튼
      return createElement(
        "button",
        {
          key: `${reward.icon}-${index}`,
          type: "button",
          className: REWARD_BORDER_BTN_CLASS,
          style: { outline: "none" },
          "aria-label": `${reward.label} 크게 보기`,
          onClick: () => onOpenProfileBorderZoom?.(reward),
        },
        rewardIcon(reward, REWARD_BORDER_ICON_CLASS),
        createElement("span", { className: REWARD_BORDER_LABEL_CLASS }, reward.label),
      )
    }),
  )
}

// 알림으로 들어온 과제 줄은 표시(data·aria-current) 붙임
export default function InvitedGuestsChallengeRow({
  achievementId = null,
  label,
  rewards,
  cleared = false,
  current = null,
  threshold = null,
  targeted = false,
  onOpenProfileBorderZoom,
}) {
  const rowProps = {
    className: TABLE_ROW_CLASS,
    "data-achievement-id": achievementId ?? undefined,
    "data-notification-target": targeted ? "true" : undefined,
    "aria-current": targeted ? "true" : undefined,
  }

  // 받은 과제는 이름·보상 대신 클리어 한 줄
  if (cleared) {
    return createElement(
      "tr",
      rowProps,
      createElement(
        "td",
        { colSpan: 2, className: CHALLENGE_CLEARED_CELL_CLASS },
        "-- 도전과제 클리어 --",
      ),
    )
  }

  // 진행 숫자 둘 다 있을 때만 (현재/목표) 붙임, 현재는 목표 넘지 않게
  const hasProgress = typeof current === "number" && typeof threshold === "number"

  return createElement(
    "tr",
    rowProps,
    createElement(
      "td",
      { className: CHALLENGE_LABEL_CELL_CLASS },
      label,
      hasProgress ? ` (${Math.min(current, threshold)}/${threshold})` : null,
    ),
    createElement(
      "td",
      { className: CHALLENGE_REWARD_CELL_CLASS },
      createElement(InvitedGuestsChallengeRewards, { rewards, onOpenProfileBorderZoom }),
    ),
  )
}
