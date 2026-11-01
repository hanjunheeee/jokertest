// 잠긴 기록 해금 조건·진행도·보상 묶음 (JSX 없이 createElement로 그림)
// forbiddenRecords/ForbiddenRecordsRightPage.jsx가 씀, 시험도 직접 불러 봄
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

// 보상 아이콘·개수 줄, 보상 없으면 안 그림
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

// [조건] 시 해금 + 진행도 + 보상 차례로 쌓음
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
      // 진행도 글자 없으면 진행도 줄 뺌
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
