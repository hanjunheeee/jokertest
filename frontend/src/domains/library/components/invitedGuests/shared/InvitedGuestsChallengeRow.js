// 파일 역할: InvitedGuestsChallengeRow.js — 직업 도전과제 한 줄 + 보상 표시(순수 표시,
// createElement).
//
// F-12 CODEX-3 재검토(AC-01): 이 저장소의 프런트엔드 테스트는 변환기 없이 node --test로
// 곧장 돌아가므로(.jsx는 파싱할 수 없다) — InGameParchmentPanelBase.js가 이미 문서화한
// 이유와 같다. 15개 직업 도전과제(5직업 × 10/20/30승)의 label·보상·cleared·진행률 원문이
// 실제로 DOM에 그대로 렌더되는지를 증명하려면, 이 행 표시 자체가 테스트가 import할 수
// 있는 .js여야 한다. 원래 별도 파일이던 보상 렌더(InvitedGuestsChallengeRewards.jsx)를
// 여기 로컬 함수로 합쳤다 — 이 컴포넌트에서만 쓰이던 내부 구현이라 분리 유지가 필요
// 없고(다른 호출부 없음), 이 슬라이스의 수정 범위(파일 수 한도)를 지킨다.
//
// PublicAsset.jsx는 여기서 쓰지 않는다 — ForbiddenRecordsUnlockCondition.js와 같은 이유로,
// PublicAsset이 실제로 하는 일(publicAsset()으로 NFC 경로를 만들고 실패 시 NFD로 한 번
// 재시도)을 그대로 복제해 <img>를 직접 그린다.
import { createElement } from "react"
import {
  INVITED_GUESTS_CHALLENGE_CLEARED_CELL_CLASS,
  INVITED_GUESTS_CHALLENGE_LABEL_CELL_CLASS,
  INVITED_GUESTS_CHALLENGE_REWARD_CELL_CLASS,
  INVITED_GUESTS_TABLE_ROW_CLASS,
} from "../../../constants/invitedGuests/tableStyle.js"
import {
  INVITED_GUESTS_REWARD_BORDER_BUTTON_CLASS,
  INVITED_GUESTS_REWARD_BORDER_ICON_CLASS,
  INVITED_GUESTS_REWARD_BORDER_LABEL_CLASS,
  INVITED_GUESTS_REWARD_COUNT_CLASS,
  INVITED_GUESTS_REWARD_CURRENCY_CLASS,
  INVITED_GUESTS_REWARD_ICON_CLASS,
  INVITED_GUESTS_REWARD_ROW_CLASS,
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
    { className: INVITED_GUESTS_REWARD_ROW_CLASS },
    rewards.map((reward, index) => {
      if (reward.type === "currency") {
        return createElement(
          "span",
          { key: `${reward.icon}-${index}`, className: INVITED_GUESTS_REWARD_CURRENCY_CLASS },
          rewardIcon(reward, INVITED_GUESTS_REWARD_ICON_CLASS),
          createElement("span", { className: INVITED_GUESTS_REWARD_COUNT_CLASS }, `×${reward.count}`),
        )
      }

      return createElement(
        "button",
        {
          key: `${reward.icon}-${index}`,
          type: "button",
          className: INVITED_GUESTS_REWARD_BORDER_BUTTON_CLASS,
          style: { outline: "none" },
          "aria-label": `${reward.label} 크게 보기`,
          onClick: () => onOpenProfileBorderZoom?.(reward),
        },
        rewardIcon(reward, INVITED_GUESTS_REWARD_BORDER_ICON_CLASS),
        createElement("span", { className: INVITED_GUESTS_REWARD_BORDER_LABEL_CLASS }, reward.label),
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
  // F-17(AC-02): 알림이 가리키는 행인가. 표시만 바꾸고 진행률·지급에는 관여하지 않는다.
  targeted = false,
  onOpenProfileBorderZoom,
}) {
  // 클리어 행과 미클리어 행이 같은 표식을 갖게 공통으로 만든다 — 방금 달성한 업적은
  // 클리어 행으로 렌더되므로 여기서 갈라지면 정작 대상이 표시되지 않는다.
  const rowProps = {
    className: INVITED_GUESTS_TABLE_ROW_CLASS,
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
        { colSpan: 2, className: INVITED_GUESTS_CHALLENGE_CLEARED_CELL_CLASS },
        "-- 도전과제 클리어 --",
      ),
    )
  }

  // F-12 AC-01: 서버 진행률(current/threshold)이 있으면 label 옆에 함께 보여준다 —
  // roleStatistics.store.js/mergeInvitedGuestsSpreads.js가 더 이상 cleared 불리언만
  // 남기고 버리지 않는다(CODEX-1 재검토).
  const hasProgress = typeof current === "number" && typeof threshold === "number"

  return createElement(
    "tr",
    rowProps,
    createElement(
      "td",
      { className: INVITED_GUESTS_CHALLENGE_LABEL_CELL_CLASS },
      label,
      hasProgress ? ` (${Math.min(current, threshold)}/${threshold})` : null,
    ),
    createElement(
      "td",
      { className: INVITED_GUESTS_CHALLENGE_REWARD_CELL_CLASS },
      createElement(InvitedGuestsChallengeRewards, { rewards, onOpenProfileBorderZoom }),
    ),
  )
}
