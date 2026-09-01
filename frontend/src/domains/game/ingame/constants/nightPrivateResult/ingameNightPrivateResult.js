/**
 * NIGHT 개인 조사 결과(night_action_result) 오버레이의 문구와 본문 레이아웃.
 *
 * 본문 문구는 reduceInGameNightPrivateResult가 역할 공개 표시 데이터
 * (getInGameRoleRevealDisplay)를 재사용해 만든다.
 * 셸·확인 버튼·z-index는 constants/parchment/ingameParchmentModalVariants.js가 담당한다.
 */

/** 확인(닫기) 버튼 문구 — 역할 공개/밤 안내/진입 연출과 동일한 관례. */
export const INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL = "확인"

/** 오버레이 전체를 감싸는 dialog의 접근성 라벨. */
export const INGAME_NIGHT_PRIVATE_RESULT_DIALOG_LABEL = "밤 조사 결과"

/** 뒤 배경(게임 화면)을 눌러 닫을 수 있는 backdrop 버튼의 접근성 라벨. */
export const INGAME_NIGHT_PRIVATE_RESULT_BACKDROP_LABEL = "밤 조사 결과 닫기"

export const INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS =
  "font-subheading text-[clamp(1.1rem,4.4vw,2.1rem)] font-bold leading-tight tracking-wide text-[#3a1a0c]"
