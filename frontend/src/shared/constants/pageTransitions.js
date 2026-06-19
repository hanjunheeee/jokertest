/**
 * 페이지 공통 전환 애니메이션 상수.
 *
 * BG_FADE_TRANSITION: 배경 이미지·영상의 페이드인 (0.7s, ease-out 커스텀 커브)
 * UI_REVEAL_TRANSITION: 패널·버튼 등 UI 요소의 입장 연출 (0.9s, 더 부드러운 커브)
 *
 * [0.22, 1, 0.36, 1]: cubic-bezier — 빠르게 시작해 끝에서 부드럽게 감속하는 ease-out 계열.
 */
export const BG_FADE_TRANSITION = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
export const UI_REVEAL_TRANSITION = { duration: 0.9, ease: [0.22, 1, 0.36, 1] }
