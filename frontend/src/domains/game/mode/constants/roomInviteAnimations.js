/**
 * RoomInvitePage 입장 애니메이션 variants.
 *
 * PARCHMENT_FRAME_VARIANTS: 양피지 프레임이 위에서 살짝 기울어진 채 내려앉는 spring 연출.
 *   when: "beforeChildren" — 프레임이 자리를 잡은 뒤 자식(버튼 행)이 등장합니다.
 *   delayChildren: 0.22s — spring이 안착하는 시간을 벌기 위한 딜레이.
 *
 * BUTTON_ROW_VARIANTS: 버튼들을 순차적으로 등장시키는 stagger 컨테이너.
 *   staggerChildren: 0.05s — 취소·참여하기 버튼이 50ms 간격으로 나타납니다.
 *
 * BUTTON_VARIANTS / BACK_BTN_VARIANTS: 개별 버튼 페이드인+슬라이드업 연출.
 */

/** 양피지 프레임 — 기울어진 채 내려앉는 spring 연출 */
export const PARCHMENT_FRAME_VARIANTS = {
  hidden: { opacity: 0, y: -14, rotate: -1, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    rotate: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 32,
      mass: 1,
      when: "beforeChildren", // 프레임 안착 후 자식 등장
      delayChildren: 0.22,
    },
  },
}

/** 버튼 행 — staggerChildren으로 순차 등장 */
export const BUTTON_ROW_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}

/** 개별 버튼 — 페이드인 + 슬라이드업 */
export const BUTTON_VARIANTS = {
  hidden: { opacity: 0, y: 5 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
}

/** 뒤로가기 버튼 — 프레임보다 약간 늦게 등장 */
export const BACK_BTN_VARIANTS = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.38 },
  },
}
