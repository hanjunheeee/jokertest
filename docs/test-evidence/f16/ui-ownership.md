# F-16 · UI 입력 소유권 (미완료 — 전수 표식 전 상태)

기준 HEAD 30432445.

> **이 문서는 완료 기록이 아니다.** 계획 메모는 확인/취소 의미를 가진 제어 전수에
> `data-sfx-owner="explicit"` 표식을 달고 그 목록을 여기 남기라고 요구한다. 이번 슬라이스는
> 승인된 수정 범위(파일 10 + 신규 6 + 따라오는 수정 4) 안에서 **소유권 계약과 일반 클릭
> 단일 소유자까지만** 구현했고, 각 컴포넌트 표식은 `.pluto/expansion-request.json`의
> F16-EXP-03 · F16-EXP-04로 올려 두었다. 표식이 없는 확인/취소 제어는 지금 일반 클릭
> 의미로 울린다 — 그래서 AC-01을 완료로 판정하지 않는다.

## 구현된 소유권 규칙 (`frontend/src/shared/hooks/useSfxRuntime.js`)

1. **일반 활성 버튼/링크는 document capture click 하나가 소유한다.**
   `composedPath()`에서 가장 가까운 활성 제어를 고른다. 활성 제어는
   `button` · `a[href]` · `input[type=button|checkbox|radio]` · `role`이
   `button|checkbox|radio|menuitem|tab`인 요소다.
2. **제외 대상**: `disabled` · `aria-disabled="true"` · `inert` · submit 제어
   (`button[type=submit]`, form 안의 기본 `button`, `input[type=submit]`).
   submit은 form submit 경계가 소유하므로 클릭으로 한 번 더 울리지 않는다.
3. **명시 소유 영역 제외**: composedPath에 `data-sfx-owner="explicit"`가 하나라도 있으면
   바깥 capture는 **무조건** 제외한다. 그 제어는 자기 자신이 `dispatchUiSfx`를 부른다.
4. **의미 표식**: `data-sfx-kind="ui-confirm" | "ui-cancel"`이 있으면 그 의미로, 없으면
   `ui-click`으로 낸다.
5. **같은 물리 입력은 한 번만.** native Event를 `WeakSet`으로 한 번만 소비한다. 키보드
   Enter/Space가 만든 click도 같은 native Event 하나라서 별도 keydown 소리를 더하지 않는다.
   겹친 리스너(backdrop + Escape 등)가 같은 Event를 공유하면 두 번째는 조용히 무시된다.
6. **이벤트 없는 native `confirm()`** 결과는 호출마다 단일 actionId를 발급한다
   (`dispatchUiSfx(kind)`를 인자 없이 호출).
7. **소리는 업무 콜백을 막지 않는다.** capture 핸들러 전체가 try/catch 안에 있고,
   예외·대기를 전파하지 않는다. 짧은 연타는 재생기 cooldown이 억제하지만 **입력 자체는
   막지 않는다.**

## 현재 상태 — 제어별 소유자

| 실제 파일/진입 | 계획이 정한 최종 의미 | 지금 상태 |
| --- | --- | --- |
| `shared/ui/BackButton.jsx` | cancel 명시 | ❌ 표식 없음 → generic `ui-click` |
| `shared/ui/CheckBox.jsx` | generic click 하나 (`button role=checkbox`) | ✅ generic 소유자가 처리 |
| `shared/ui/Stepper.jsx` | 실제 값 변경 시 click, 경계 clamp는 0 | ⚠️ generic click. 경계에서도 울림 |
| `auth/components/AuthScene/AuthFrame.jsx` | form submit confirm 하나 | ❌ submit 제어는 제외되고 submit 경계 미연결 → 무음 |
| `user/components/AccountPanel/NicknameSection.jsx`, `PasswordSection.jsx` | form submit confirm | ❌ 같음 |
| `user/components/DiscordAccountLink.jsx` | `window.confirm` 결과만 confirm/cancel | ❌ 미연결 |
| `ingame/utils/createExitConfirmController.js` + `hooks/useInGameExit.js` | confirm 반환에 confirm/cancel | ❌ F16-EXP-03 |
| `game/setup/hooks/useGameSetupPage.js::goBackToMultiplay` | confirm 결과 단일 소유 | ❌ F16-EXP-03 |
| `game/matching/hooks/useMatchingRoom.js::settleFailed` | dialog 결과 단일 소유 | ❌ 파일은 범위 안이나 F16-EXP-03과 함께 처리하기 위해 보류 |
| `ingame/components/parchment/InGameParchmentModalBase.js`, `…Animated.jsx` | backdrop/Escape cancel, 확인 버튼 confirm | ❌ 표식 없음 |
| `store/components/bulkPurchase/*` (Overlay·Panel·Summary) | Escape/backdrop/닫기 cancel, `onConfirm` confirm | ❌ 표식 없음 |
| `shared/ui/profileBorderZoom/ProfileBorderZoomOverlay.jsx`, `tutorialGuide/TutorialGuideOverlay.jsx` | 열림 상태 Escape/backdrop/닫기 cancel | ❌ 표식 없음 |
| `user/components/skinCardWear/SkinCardWearOverlay.jsx`, `profileEdit/ProfileEditOverlay.jsx` | Escape/backdrop/닫기 cancel, 장착/저장 confirm | ❌ 표식 없음 |
| `store/components/skinZoom/StoreSkinZoomOverlay.jsx` | 열림 상태 Escape/backdrop/닫기 cancel | ❌ 표식 없음 |
| `ingame/components/chat/closeup/InGameChatCloseupOverlay.jsx`, `vote/InGameVoteStatusPanel.jsx`, `controls/ingameSetting/kickPlayer/SettingKickPlayerModal.jsx` | Escape/닫기 cancel, 확인/강퇴 confirm | ❌ 표식 없음 |
| 그 밖의 기존 button/link | generic click 단일 소유 | ✅ generic 소유자가 처리 |

범례: ✅ 계약대로 동작 · ⚠️ 소리는 나지만 계획이 요구한 정밀도에 미달 · ❌ 미연결

## 남은 일

표식 작업이 승인되면 위 ❌/⚠️ 행마다 `data-sfx-owner="explicit"`와
`dispatchUiSfx('ui-confirm' | 'ui-cancel')`를 달고, 실제 DOM capture와 production 컴포넌트
콜백을 함께 실행하는 시험으로 mouse click · Enter · Space · form submit · backdrop · Escape ·
native dialog true/false · disabled · 반복 입력 · unmount cleanup에서 **각 action당 최대 1**과
업무 호출 횟수를 검사한다. 모든 dialog의 `onClose`를 전역 Escape로 대신 실행하지 않는다.
기존 UI 닫힘 정책은 바꾸지 않는다.
