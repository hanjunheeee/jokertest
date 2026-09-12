# F-16 · UI 입력 소유권 전수

기준 HEAD f9805796 위의 후속 구현.

> **이 문서는 설계·연결 기록이며 시험 통과·실제 청음 증거가 아니다.** 현재 배포 manifest는
> 모든 항목이 미검토라(`frontend/src/shared/audio/sfxManifest.js`) 아래 모든 입력은 "무음 +
> 사유 기록"으로 끝난다. 자산과 이용 조건 검토는 외부 입력 의존으로 여전히 미제공이다.

## 소유권 규칙 (`frontend/src/shared/hooks/useSfxRuntime.js`)

1. **일반 활성 버튼/링크는 document capture click 하나가 소유한다.**
   `composedPath()`에서 가장 가까운 활성 제어를 고른다. 활성 제어는
   `button` · `a[href]` · `input[type=button|checkbox|radio]` · `role`이
   `button|checkbox|radio|menuitem|tab`인 요소다.
2. **제외 대상**: `disabled` · `aria-disabled="true"` · `inert` · submit 제어
   (`button[type=submit]`, form 안의 기본 `button`, `input[type=submit]`).
   submit은 form submit 경계가 소유한다.
3. **명시 소유 영역 제외**: composedPath에 `data-sfx-owner="explicit"`가 하나라도 있으면
   바깥 capture는 **무조건** 제외한다. 그 제어가 직접 `dispatchUiSfx`를 부른다.
4. **의미 표식**: `data-sfx-kind="ui-confirm" | "ui-cancel"`이 있으면 그 의미로, 없으면
   `ui-click`으로 낸다. 일반 버튼에 의미만 필요한 경우 표식 하나로 충분하다(소유자는 그대로
   capture 하나이므로 이중 dispatch가 구조적으로 불가능하다).
5. **같은 물리 입력은 한 번만.** native Event를 `WeakSet`으로 한 번만 소비한다. 키보드
   Enter/Space가 만든 click도 같은 native Event 하나라서 별도 keydown 소리를 더하지 않는다.
   겹친 리스너(backdrop + Escape 등)가 같은 Event를 공유하면 두 번째는 조용히 무시된다.
6. **native confirm의 호출 버튼도 명시 소유자를 표시한다.** Chrome은 document capture와 React 콜백 사이에 microtask를 실행할 수 있으므로 일반 클릭 예약을 나중에 취소하는 방법은 안전하지 않다. 실제 호출 버튼에 `data-sfx-owner="explicit"`를 달고 확인창 반환 콜백만 dispatch한다. 네트워크 실패가 띄우는 확인창은 클릭과 무관한 별도 입력이다.
7. **소리는 업무 콜백을 막지 않는다.** capture 핸들러 전체가 try/catch 안에 있고,
   예외·대기를 전파하지 않는다. 짧은 연타는 재생기 cooldown이 억제하지만 **입력 자체는
   막지 않는다.**

## 제어별 소유자 전수

| 실제 파일/진입 | 최종 의미 | 구현 방식 |
| --- | --- | --- |
| `shared/ui/BackButton.jsx` | cancel | `data-sfx-kind="ui-cancel"` (capture 소유) |
| `shared/ui/CheckBox.jsx` | generic click (`button role=checkbox`) | 표식 없음 — capture 기본 |
| `shared/ui/Stepper.jsx` | 실제 값 변경 시 click, 경계·clamp는 0 | `data-sfx-owner="explicit"` + `updateIndex`가 `clamped !== index`일 때만 dispatch |
| `auth/.../AuthFrame.jsx` | form submit confirm 하나 | `handleSubmit`이 `dispatchUiSfx("ui-confirm", event)`; `onSubmit`이 없으면 0 |
| `user/.../NicknameSection.jsx`, `PasswordSection.jsx` | form submit confirm | 같음. `ConfirmButton`은 `type="submit"`이라 capture에서 제외 |
| `user/components/DiscordAccountLink.jsx` | `window.confirm` 결과만 confirm/cancel | 반환 경계에서 dispatch(이벤트 없이). form에는 표식 없음 |
| `ingame/utils/createExitConfirmController.js` + `hooks/useInGameExit.js` | confirm 반환에 confirm/cancel, trigger click 제외 | controller의 `onDecision` 주입 → 훅이 `dispatchUiSfx(kind)`. `InGameTopControls`의 실제 나가기 버튼을 explicit로 제외한다. 취소 leave 0 / 승인 leave 1 유지 |
| `game/setup/hooks/useGameSetupPage.js::goBackToMultiplay` | 생성 중 confirm 결과 단일 소유, 평상시 cancel 하나 | 두 분기 모두 dispatch. `GameSetupPageControls`의 실제 뒤로가기 버튼을 explicit로 제외한다 |
| `game/matching/hooks/useMatchingRoom.js::settleFailed` | dialog 결과 단일 소유, 오래된 series·중복 prompt는 0 | 기존 `cancelled`/`seriesId`/`hasPromptedRetry` 가드 **뒤**에서만 dispatch |
| `ingame/.../InGameParchmentModalBase.js`, `…Animated.jsx` | backdrop/Escape cancel, 확인 버튼 confirm | backdrop `<button>`에 `data-sfx-kind="ui-cancel"`, Escape 핸들러가 명시 dispatch, 확인 버튼은 `InGameParchmentConfirmButton`의 `data-sfx-kind="ui-confirm"` |
| `ingame/.../InGameParchmentConfirmButton.js` | confirm | `sfxKind` prop(기본 `ui-confirm`) → `data-sfx-kind` |
| `store/.../StoreBulkPurchaseOverlay.jsx` | Escape/backdrop cancel | Escape 명시 dispatch + backdrop `data-sfx-kind` |
| `store/.../StoreBulkPurchasePanel.jsx` | 닫기 cancel | `data-sfx-kind="ui-cancel"` |
| `store/.../StoreBulkPurchaseSummary.jsx` | `onConfirm` confirm, disabled는 0 | `data-sfx-kind="ui-confirm"`; 기존 `disabled`(준비중 가격·pending/unknown/confirmed/blocked)를 capture가 제외 |
| `store/components/StorePurchaseFeedback.jsx` | `onCheck`/`onRetry`는 **일반 click** | 표식 없음(분류 결과 — 파일에 주석으로 고정) |
| `store/.../StoreSkinZoomOverlay.jsx` | 열림 상태 Escape/backdrop cancel | 같은 패턴 |
| `shared/ui/profileBorderZoom/ProfileBorderZoomOverlay.jsx` | Escape/backdrop cancel | 같은 패턴 |
| `shared/ui/tutorialGuide/TutorialGuideOverlay.jsx` | Escape/backdrop cancel, 화살표는 실제 page 변경 click·경계 0 | Escape 명시 dispatch + backdrop `data-sfx-kind`. 화살표는 `disabled={!canGoPrev/Next}`라 경계에서 capture가 제외. ArrowLeft/Right **키**에는 소리를 붙이지 않는다 |
| `user/.../SkinCardWearOverlay.jsx` | Escape/backdrop/닫기 cancel, 장착 confirm | `handleClose`/`handleConfirm`이 명시 dispatch(첫 await 이전). backdrop·패널 닫기·확인 버튼 모두 `data-sfx-owner="explicit"` |
| `user/.../ProfileEditOverlay.jsx` | Escape/backdrop/닫기 cancel, 저장 confirm | 같은 패턴(`handleClose` / `handleConfirmWithSfx`) |
| `ingame/.../InGameChatCloseupOverlay.jsx` | Escape/backdrop/닫기 cancel | Escape 명시 + backdrop·닫기 `data-sfx-kind`. 채팅 타이핑 keyDown에는 소리 없음 |
| `ingame/.../InGameVoteStatusPanel.jsx` | Escape/backdrop/닫기 cancel | 같은 패턴 |
| `ingame/.../SettingKickPlayerModal.jsx` | Escape/backdrop/닫기 cancel | 같은 패턴 |
| 그 밖의 기존 button/link | generic click 단일 소유 | 표식 없음 |

**분류를 마치지 못한 확인/취소 제어는 없다.** 위 표에 없는 제어는 전부 "일반 클릭" 분류이며,
`StorePurchaseFeedback`처럼 판단이 갈릴 수 있는 곳에는 그 이유를 소스 주석으로 남겼다.

## 검증

- `frontend/src/shared/hooks/__tests__/sfxUiOwnership.test.js` — 실제 런타임을 jsdom에
  마운트해 mouse click · 같은 native Event 공유 · form submit · disabled/aria-disabled/inert/
  submit 제외 · `data-sfx-owner=explicit` 제외 · native confirm 호출 버튼 제외 · 반복 입력 ·
  재생기 예외 격리 · 언마운트 cleanup을 검사한다. `createExitConfirmController`는 실제
  코드로 확인/취소와 leave 호출 수를 함께 센다.
- 구현자 단계에서는 미실행이었다. 운영자 수정 후 전체 frontend 1,643개 PASS, fail/skip 0 및 build PASS(2026-09-12).
- 실제 Chrome에서 production 버튼·런타임을 사용하는 회귀 fixture로 중복을 재현했다. 수정 전 나가기 1회에 ui-click+ui-cancel 2건, 수정 후 나가기/생성 화면 뒤로가기 각각 ui-cancel 1건이다. fixture는 확인창 취소 이후 콜백을 사용하므로 native dialog UI 자체의 검증으로 주장하지 않는다. 전체 앱 검증 기록은 별도 기록한다.
