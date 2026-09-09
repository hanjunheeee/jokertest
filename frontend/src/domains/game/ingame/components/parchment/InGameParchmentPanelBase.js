// 파일 역할: InGameParchmentPanelBase.js - 파치먼트 공용 셸의 단일 구현입니다.
import { createElement, useState } from "react"
import {
  INGAME_PARCHMENT_CONTENT_CLASS,
  INGAME_PARCHMENT_FALLBACK_CONTENT_CLASS,
  INGAME_PARCHMENT_FALLBACK_FRAME_CLASS,
  INGAME_PARCHMENT_FRAME_CLASS,
  INGAME_PARCHMENT_IMAGE_CLASS,
  INGAME_PARCHMENT_IMAGE_URL,
} from "../../constants/parchment/ingameParchmentLayout.js"
import { publicAsset } from "../../../../../shared/utils/publicAsset.js"

/**
 * 인게임 파치먼트 공용 셸.
 *
 * 역할 공개 오버레이·밤 역할 턴 안내 오버레이·DAY/NIGHT 진입 연출이 이 구현 하나를
 * 공유한다 — 배경 이미지 URL·가로세로비·안쪽 여백을 한 곳에서만 정의해 세 화면이 어긋나지
 * 않게 한다. InGameParchmentPanel.jsx는 이 파일을 그대로 다시 내보내는 얇은 껍데기다.
 *
 * JSX가 아니라 createElement로 쓰여 있는 이유: 이 저장소의 프런트엔드 테스트는 변환기 없이
 * node --test로 곧장 돌아가므로(.jsx는 파싱할 수 없다), 실제 프로덕션 DOM을 검증해야 하는
 * 화면은 테스트가 그대로 import할 수 있는 .js여야 한다. 별도의 시각적 복제본을 만들지 않기
 * 위해 셸 구현 자체를 이쪽으로 옮겼다.
 *
 * 표시 전용이다: 소켓 emit·store 변경·phase 전이를 일절 하지 않는다. 배경 이미지를 불러오지
 * 못하면(onError) 이미지 없이도 읽을 수 있는 대체 패널로 즉시 전환한다.
 */
export default function InGameParchmentPanelBase({
  children,
  contentClassName = "",
  frameClassName = INGAME_PARCHMENT_FRAME_CLASS,
  fallbackFrameClassName = INGAME_PARCHMENT_FALLBACK_FRAME_CLASS,
  ...rest
}) {
  const [backgroundFailed, setBackgroundFailed] = useState(false)

  if (backgroundFailed) {
    return createElement(
      "div",
      { className: fallbackFrameClassName, "data-parchment-fallback": "true", ...rest },
      createElement(
        "div",
        { className: `${INGAME_PARCHMENT_FALLBACK_CONTENT_CLASS} ${contentClassName}`.trim() },
        children,
      ),
    )
  }

  return createElement(
    "div",
    { className: frameClassName, ...rest },
    createElement("img", {
      src: publicAsset(INGAME_PARCHMENT_IMAGE_URL),
      alt: "",
      "aria-hidden": "true",
      draggable: false,
      className: INGAME_PARCHMENT_IMAGE_CLASS,
      onError: () => setBackgroundFailed(true),
    }),
    createElement(
      "div",
      { className: `${INGAME_PARCHMENT_CONTENT_CLASS} ${contentClassName}`.trim() },
      children,
    ),
  )
}
