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

function handleRewardIconError(event) {
  const image = event.currentTarget
  const src = image.dataset.assetSrc
  if (image.dataset.nfdFallbackSource !== src) {
    const normalized = src.startsWith("/") ? src : `/${src}`
    const fallbackSrc = encodeURI(normalized.normalize("NFD"))
    if (fallbackSrc !== image.getAttribute("src")) {
      image.dataset.nfdFallbackSource = src
      image.src = fallbackSrc
    }
  }
}

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

function InvitedGuestsChallengeRewards({ rewards, onOpenProfileBorderZoom }) {
  return createElement(
    "div",
    { className: REWARD_ROW_CLASS },
    rewards.map((reward, index) => {
      if (reward.type === "currency") {
        return createElement(
          "span",
          { key: `${reward.icon}-${index}`, className: REWARD_CURRENCY_CLASS },
          rewardIcon(reward, REWARD_ICON_CLASS),
          createElement("span", { className: REWARD_COUNT_CLASS }, `×${reward.count}`),
        )
      }

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
