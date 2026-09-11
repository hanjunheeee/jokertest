// 파일 역할: ForbiddenRecordsUnlockCondition.js — 금지된 기록 해금 조건 + 보상 표시(순수
// 표시, createElement).
//
// F-12 CODEX-3 재검토(AC-01): 이 저장소의 프런트엔드 테스트는 변환기 없이 node --test로
// 곧장 돌아가므로(.jsx는 파싱할 수 없다) — InGameParchmentPanelBase.js가 이미 문서화한
// 이유와 같다. 22개 업적(기록 7 + 직업 도전과제 15)의 unlockCondition·unlockRewards·
// progress 원문이 실제로 DOM에 그대로 렌더되는지(순수 함수 실행이나 소스 문자열 검사가
// 아니라)를 증명하려면, 이 조건·보상 표시 자체가 테스트가 import할 수 있는 .js여야 한다.
// 원래 별도 파일이던 보상 렌더(ForbiddenRecordsUnlockRewards.jsx)를 여기 로컬 함수로
// 합쳤다 — 이 컴포넌트에서만 쓰이던 내부 구현이라 분리 유지가 필요 없고(다른 호출부
// 없음), 이 슬라이스의 수정 범위(파일 수 한도)를 지킨다.
//
// PublicAsset.jsx(공용 이미지 컴포넌트)는 여기서 쓰지 않는다 — 그 컴포넌트 자체가 실제
// JSX 구문이라 이 파일이 그걸 import하면 다시 파싱 불가능해진다. 대신 PublicAsset.jsx가
// 실제로 하는 일(publicAsset()으로 NFC 경로를 만들고, 최초 요청이 실패하면 NFD 경로로
// 한 번 재시도한다)을 그대로 복제해 <img>를 직접 그린다 — 동작은 PublicAsset과 동일해야
// 하므로 로직을 다시 구현하지 않고 그대로 옮겼다.
import { createElement } from "react"
import {
  LIBRARY_FORBIDDEN_UNLOCK_BRACKET_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_CHALLENGE_GROUP_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_CONDITION_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_LABEL_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_STACK_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_VALUE_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_ROW_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_STACK_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_SUFFIX_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_COUNT_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_ICON_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_ITEM_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_LABEL_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_ROW_CLASS,
  LIBRARY_FORBIDDEN_UNLOCK_REWARD_STACK_CLASS,
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

/** 금지된 기록 — 해금 보상 (인게임 재화 아이콘 + 수량) */
function ForbiddenRecordsUnlockRewards({ rewards }) {
  if (!rewards?.length) return null

  return createElement(
    "div",
    { className: LIBRARY_FORBIDDEN_UNLOCK_REWARD_STACK_CLASS },
    createElement("p", { className: LIBRARY_FORBIDDEN_UNLOCK_REWARD_LABEL_CLASS }, "보상"),
    createElement(
      "div",
      { className: LIBRARY_FORBIDDEN_UNLOCK_REWARD_ROW_CLASS },
      rewards.map((reward) =>
        createElement(
          "div",
          { key: reward.icon, className: LIBRARY_FORBIDDEN_UNLOCK_REWARD_ITEM_CLASS },
          createElement("img", {
            src: publicAsset(reward.icon),
            alt: "",
            className: LIBRARY_FORBIDDEN_UNLOCK_REWARD_ICON_CLASS,
            draggable: false,
            "data-asset-src": reward.icon,
            onError: handleRewardIconError,
          }),
          createElement("span", { className: LIBRARY_FORBIDDEN_UNLOCK_REWARD_COUNT_CLASS }, `×${reward.count}`),
        ),
      ),
    ),
  )
}

/** 금지된 기록 — 해금 조건 (대괄호 + 조건 + 시 해금 + 진행도 + 보상) */
export default function ForbiddenRecordsUnlockCondition({ condition, progress, rewards }) {
  return createElement(
    "div",
    { className: LIBRARY_FORBIDDEN_UNLOCK_STACK_CLASS },
    createElement(
      "div",
      { className: LIBRARY_FORBIDDEN_UNLOCK_CHALLENGE_GROUP_CLASS },
      createElement(
        "div",
        { className: LIBRARY_FORBIDDEN_UNLOCK_ROW_CLASS },
        createElement("span", { className: LIBRARY_FORBIDDEN_UNLOCK_BRACKET_CLASS, "aria-hidden": "true" }, "["),
        createElement("span", { className: LIBRARY_FORBIDDEN_UNLOCK_CONDITION_CLASS }, condition),
        createElement("span", { className: LIBRARY_FORBIDDEN_UNLOCK_BRACKET_CLASS, "aria-hidden": "true" }, "]"),
      ),
      createElement("p", { className: LIBRARY_FORBIDDEN_UNLOCK_SUFFIX_CLASS }, "시 해금"),
      progress
        ? createElement(
            "div",
            { className: LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_STACK_CLASS },
            createElement("p", { className: LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_LABEL_CLASS }, "현재 진행도"),
            createElement("p", { className: LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_VALUE_CLASS }, progress),
          )
        : null,
    ),
    createElement(ForbiddenRecordsUnlockRewards, { rewards }),
  )
}
