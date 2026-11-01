import { createElement } from "react"
import {
  UNLOCK_BRACKET_CLASS,
  UNLOCK_CHALLENGE_GROUP_CLASS,
  UNLOCK_CONDITION_CLASS,
  UNLOCK_PROGRESS_LABEL_CLASS,
  UNLOCK_PROGRESS_STACK_CLASS,
  UNLOCK_PROGRESS_VALUE_CLASS,
  UNLOCK_ROW_CLASS,
  UNLOCK_STACK_CLASS,
  UNLOCK_SUFFIX_CLASS,
  UNLOCK_REWARD_COUNT_CLASS,
  UNLOCK_REWARD_ICON_CLASS,
  UNLOCK_REWARD_ITEM_CLASS,
  UNLOCK_REWARD_LABEL_CLASS,
  UNLOCK_REWARD_ROW_CLASS,
  UNLOCK_REWARD_STACK_CLASS,
} from "../../constants/forbiddenRecords/layoutStyle.js"
import { publicAsset } from "../../../../shared/utils/publicAsset.js"

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

function ForbiddenRecordsUnlockRewards({ rewards }) {
  if (!rewards?.length) return null

  return createElement(
    "div",
    { className: UNLOCK_REWARD_STACK_CLASS },
    createElement("p", { className: UNLOCK_REWARD_LABEL_CLASS }, "보상"),
    createElement(
      "div",
      { className: UNLOCK_REWARD_ROW_CLASS },
      rewards.map((reward) =>
        createElement(
          "div",
          { key: reward.icon, className: UNLOCK_REWARD_ITEM_CLASS },
          createElement("img", {
            src: publicAsset(reward.icon),
            alt: "",
            className: UNLOCK_REWARD_ICON_CLASS,
            draggable: false,
            "data-asset-src": reward.icon,
            onError: handleRewardIconError,
          }),
          createElement("span", { className: UNLOCK_REWARD_COUNT_CLASS }, `×${reward.count}`),
        ),
      ),
    ),
  )
}

export default function ForbiddenRecordsUnlockCondition({ condition, progress, rewards }) {
  return createElement(
    "div",
    { className: UNLOCK_STACK_CLASS },
    createElement(
      "div",
      { className: UNLOCK_CHALLENGE_GROUP_CLASS },
      createElement(
        "div",
        { className: UNLOCK_ROW_CLASS },
        createElement("span", { className: UNLOCK_BRACKET_CLASS, "aria-hidden": "true" }, "["),
        createElement("span", { className: UNLOCK_CONDITION_CLASS }, condition),
        createElement("span", { className: UNLOCK_BRACKET_CLASS, "aria-hidden": "true" }, "]"),
      ),
      createElement("p", { className: UNLOCK_SUFFIX_CLASS }, "시 해금"),
      progress
        ? createElement(
            "div",
            { className: UNLOCK_PROGRESS_STACK_CLASS },
            createElement("p", { className: UNLOCK_PROGRESS_LABEL_CLASS }, "현재 진행도"),
            createElement("p", { className: UNLOCK_PROGRESS_VALUE_CLASS }, progress),
          )
        : null,
    ),
    createElement(ForbiddenRecordsUnlockRewards, { rewards }),
  )
}
