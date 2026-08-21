/**
 * NIGHT 개인 조사 결과(night_action_result) 오버레이의 문구와 레이아웃.
 *
 * GUARD의 조사(INVESTIGATE)·WITCH_HUNTER의 확인(CONFIRM) 결과는 서버가 본인 소켓에게만
 * 보내는 1회성 개인 정보다. 이 파일은 그 결과를 감싸는 껍데기(버튼 문구·접근성 라벨·클래스)만
 * 소유한다 — 본문 문구는 reduceInGameNightPrivateResult가 역할 공개 표시 데이터
 * (getInGameRoleRevealDisplay)를 재사용해 만든다.
 *
 * 배경은 역할 공개·밤 역할 턴 안내·진입 연출과 같은 공용 파치먼트 셸을 그대로 쓴다 — 이
 * 파일은 파치먼트 이미지 URL을 다시 정의하지 않는다(ingameParchmentLayout.js 하나만이 소유).
 */

/** 확인(닫기) 버튼 문구 — 역할 공개/밤 안내/진입 연출과 동일한 관례. */
export const INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL = "확인"

/** 오버레이 전체를 감싸는 dialog의 접근성 라벨. */
export const INGAME_NIGHT_PRIVATE_RESULT_DIALOG_LABEL = "밤 조사 결과"

/** 뒤 배경(게임 화면)을 눌러 닫을 수 있는 backdrop 버튼의 접근성 라벨. */
export const INGAME_NIGHT_PRIVATE_RESULT_BACKDROP_LABEL = "밤 조사 결과 닫기"

/**
 * 오버레이 레이아웃.
 *
 * 진입 연출(z-60대)보다는 위, 사망 연출(z-70대)보다는 아래에 놓는다 — 표시 우선순위는
 * useInGameOverlayStack의 hold 관계가 정하지만, 우선순위 겹침이 생기더라도 렌더 순서가
 * 아니라 명시적인 z 단계로 결정되게 한다(ingamePhaseEntrance.js와 동일한 정책).
 */
export const INGAME_NIGHT_PRIVATE_RESULT_BACKDROP_CLASS =
  "fixed inset-0 z-[65] w-full cursor-default bg-black/70"

export const INGAME_NIGHT_PRIVATE_RESULT_PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[66] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]"

export const INGAME_NIGHT_PRIVATE_RESULT_PANEL_CLASS = "pointer-events-auto max-w-full"

export const INGAME_NIGHT_PRIVATE_RESULT_MESSAGE_CLASS =
  "font-subheading text-[clamp(1.1rem,4.4vw,2.1rem)] font-bold leading-tight tracking-wide text-[#3a1a0c]"

export const INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_BUTTON_CLASS =
  "mt-3 min-h-9 rounded border border-[#6b4321] bg-[#e2c78f] px-6 py-1.5 text-sm font-semibold tracking-wide text-[#3a1a0c] transition hover:bg-[#f0dcae] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b4321]"
