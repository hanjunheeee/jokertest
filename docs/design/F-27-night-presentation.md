# F-27 기능 설계도 — 역할별 성공 연출과 진행 대기

> 이 문서는 F-27을 나눈 **모든 조각(BZ·CE·BL)** 의 계획·계획 검증에 같이 붙는다. 조각은 이 설계도의 자기 몫만 구현한다.
> 여기에 확정된 이름·필드·담당은 **계약**이다 — 조각의 계획은 이것을 바꾸지 않고, 부족한 점을 찾으면 고치지 말고 `unsure`에 근거와 함께 남긴다.
> 작성 2026-09-20, 기준 커밋 `38f958a3`(F-26b 병합 직후). 줄 번호는 그 시점의 위치다.

## 1. 이미 있는 것 (F-25·F-26이 만든 것 — 소비만 한다)

| 무엇 | 어디 | 핵심 동작 |
|---|---|---|
| 역할 확정 → 연출 계약 → 대기 등록 → 성공 사건 전송 → 종료 방송 → **즉시 해제** | `backend/socket/gameSession.js::endNightTurn` (1595) | 지금은 같은 동기 호출 안에서 `releaseNightPresentationWait`를 바로 부른다. F-27a가 이 "즉시"를 실제 대기로 바꾼다 |
| 대기 등록 | `::beginNightPresentationWait(run, completed, contract)` (1532) | `run.stage = PRESENTATION_WAIT`, `run.wait = token`(waitId = `게임:밤:역할:revision:waitSeq`, `contract` 포함) |
| 대기 해제 | `::releaseNightPresentationWait(run, token)` (1561) | run·세션·게임·밤·단계·토큰이 모두 맞을 때만 대기를 닫고 `advanceNightTurn(run)`. 같은 토큰의 두 번째 호출은 no-op(멱등) |
| 성공 사건 전송 | `::emitNightSuccessEvents(run, contract)` (1483), `::buildNightSuccessPayload` (1419) | 소켓 메시지 **`night_action_success`**. payload: `gameId, nightDayIndex, eventId, type(KILL·HEAL·INVESTIGATE·CONFIRM), perspectives(USER·TARGET)`, USER 관점에만 `targetId`. 수신자별 개별 emit, 전송 직전 자격 재검증 |
| 수신자별 완료 기록 | `nightSuccessReceiptsBySession` (WeakMap: session → eventId → uuid → `{membershipId, socketId, socket, completed}`) | 전송 직전에 `completed:false`로 기록, 새 밤에 교체, 세션 종료 시 삭제 |
| 완료 ACK 수신 | `::handleAcknowledgeNightActionSuccess(io, socket, uuid, payload, callback)` (4531), `registerGameHandlers`가 등록 | 소켓 메시지 **`acknowledge_night_action_success`**, 요청은 **정확히** `{gameId, nightDayIndex, eventId}`. 최초 `{ok:true,duplicate:false}` · 중복 `{ok:true,duplicate:true}` · 실패 `INVALID_PAYLOAD`·`NOT_ELIGIBLE`·`STALE_EVENT`. **기록만 하고 대기를 풀지 않는다** |
| 완료 허용 창 | `::isNightSuccessCompletionWindowOpen(session, nightDayIndex)` (4508) | NIGHT: 같은 밤 / DAY·TRIBUNAL: 다음 날 / ENDED: 같은 날 또는 다음 날 |
| 화면 큐와 완료 | `frontend/src/domains/game/ingame/store/ingameStore.js::receiveNightSuccess`, `::selectNightSuccessQueue`, `::completeNightSuccess(eventId, receiptScope)` | 수신 검증·중복 거부 후 FIFO 큐에 넣는다. 완료 시 ACK를 사건당 한 번 emit. **production 연출 소비처는 아직 없다**(F-27b가 만든다) |
| 공개 턴 방송 | `night_turn_started` / `night_turn_ended` | 이름·허용 키·개수는 잠겨 있다(바꾸지 않는다) |

## 2. F-27이 새로 확정하는 계약

### 2-1. 보고 메시지 — 새로 만들지 않고 기존 ACK를 넓힌다
- 메시지 이름은 그대로 **`acknowledge_night_action_success`**.
- 요청에 **선택 필드 `outcome`** 하나를 추가로 허용한다: `'COMPLETED'`(기본) · `'ERROR'`(재생 오류) · `'SKIPPED'`(사용자 건너뛰기).
  - `outcome`이 없으면 `COMPLETED`로 본다(F-26b 클라이언트와 호환).
  - 허용 키는 `gameId, nightDayIndex, eventId, outcome` 네 개뿐. 그 밖의 키나 허용 밖 `outcome` 값은 `INVALID_PAYLOAD`.
  - 세 값 모두 **그 수신자의 연출이 끝났다**는 보고다 — 대기 해제 판정에서 똑같이 취급한다. 기록에는 `outcome`을 같이 남긴다.
- 응답 형식(`ok/duplicate`, 실패 코드 3종)은 바꾸지 않는다.

### 2-2. 연출 대기 게이트 (서버)
- `endNightTurn`의 즉시 해제를 없애고, 아래 중 **먼저 일어난 하나**로 `releaseNightPresentationWait(run, token)`을 부른다.
  1. 그 역할의 계약에 든 **모든 사건의 모든 적격 수신자**가 완료 보고를 마쳤다(`completed === true`).
  2. **미응답 상한**이 지났다 — 서버 설정값(기본 12초, 환경 설정으로 바꿀 수 있게 한다. 사용자 제공 영상 길이가 정해지면 조정).
  3. 계약에 사건이 없거나(`contract === null` 포함) 적격 수신자가 0명이다 → 기다리지 않고 바로 해제(지금과 같은 동작).
- 해제는 밤·역할(대기 토큰) 단위로 **정확히 한 번**이다. 늦게 온 보고·중복 보고·이미 지나간 밤의 보고는 기록/거부만 하고 진행에 영향을 주지 않는다(`releaseNightPresentationWait`의 멱등성에 기댄다).
- 수신자가 대기 중에 연결을 잃거나 자격을 잃으면 그 수신자는 "기다릴 대상"에서 빠진다 — 남은 수신자가 모두 끝났으면 즉시 해제, 아니면 상한까지.
- 상한 타이머는 run의 기존 타이머 주입(`run.setTimeoutFn`/`clearTimeoutFn`)을 써서 시험에서 가짜 시계로 돌린다. run이 정리되면(게임 종료·이탈 종결) 타이머도 정리된다.
- 마지막 밤도 같은 규칙이다 — 마지막 역할의 대기가 해제된 뒤에 최종화(`finalizeNightForSession`)로 간다.

### 2-3. 비수신자 대기 알림 (서버 → 화면)
- 새 소켓 메시지 **`night_presentation_wait`**: payload는 `{gameId, nightDayIndex, waiting: true|false}` 세 키뿐. 역할·대상·사건 ID·수신자 수 등 **비밀 정보는 넣지 않는다**.
- 대기가 시작될 때 그 판의 적격 참가자 중 **그 역할 사건의 수신자가 아닌 사람**에게 `waiting:true`, 해제될 때 같은 사람들에게 `waiting:false`.
- 수신자에게는 보내지 않는다(그들은 `night_action_success`를 받는다). "대기 알림을 받았는가"로 수신자 여부가 새지 않도록, 사건이 없어 기다리지 않는 역할에서는 아무에게도 보내지 않는다.
- F-23의 "서버 송신 사건 이름 잠금" 시험(`frontend/src/domains/game/ingame/__tests__/InGamePage.deadParticipant.integration.test.js`)에 이 이름을 등록해야 한다.

### 2-4. 화면 연출 (프런트)
- 소비처는 `InGamePage`에 마운트되는 **훅 하나**(`useInGameNightSuccessPresentation`, `frontend/src/domains/game/ingame/hooks/`)다. `selectNightSuccessQueue`를 구독해 **큐의 맨 앞 하나씩** 연출하고, 끝나면 `completeNightSuccess(eventId, receiptScope, outcome)`를 부른다.
  - `completeNightSuccess`에 세 번째 인자 `outcome`(기본 `'COMPLETED'`)을 추가하고, `'COMPLETED'`가 아닐 때만 ACK payload에 `outcome`을 싣는다.
- 역할 순서(광대→의사→경비원→마녀사냥꾼)는 **서버가 턴 순서대로 보내므로 큐의 도착 순서가 곧 연출 순서**다. 화면에서 재정렬하지 않는다.
- 연출 자산: `KILL`은 기존 킬 영상. `HEAL`·`INVESTIGATE`·`CONFIRM`은 F-27b(CE)가 '자료 대기' 임시 연출로 구현했다. **정정(2026-09-21): 전용 영상 5개는 2026-09-10에 이미 수령됐다**(`docs/requirements/2026-09-10-role-video-assets.md` — ProRes 4444 알파·PCM 오디오, 내장 사운드 사용 확인). 이 설계도의 첫 판이 '제공 대기'라고 적은 것은 그 기록을 읽지 않은 작성자의 오류다. 웹용 변환(알파·오디오 보존)과 역할·관점별 연결, 내장음 동기는 **F-27c**(§3)가 맡는다. 그때까지 임시 연출은 미검증으로 남긴다(통과로 바꾸지 않는다).
- 광대 킬 뒤 의사 치료가 성공한 밤에는 두 연출을 모두 보여 준 뒤 **최종 생존 상태**를 표시한다(생존 판정은 서버 값만 쓴다).
- 재생 오류 → `'ERROR'`, 사용자 건너뛰기 → `'SKIPPED'`, 정상 종료 → `'COMPLETED'`. 사건당 보고는 한 번(F-26b의 중복 방지에 기댄다).
- 기존 최종 사망 연출 경로(`useInGameKillReveal`)와 낮 재판 처형 연출은 건드리지 않는다. 같은 밤 사건을 다음 낮에 다시 재생하지 않는다.

### 2-5. 역할 영상 자산 선택표 (F-27c) — 운영자 확정 2026-09-21: "파일 이름에 다 적혀 있다"
원본은 `.pluto/monitor/role-videos-20260910/`(Git 제외, 원본 MOV는 저장소에 넣지 않는다). 웹용 변환본은 운영자가 ffmpeg로 만들어 `frontend/public/video-direction/`에 둔다(알파·내장 오디오 보존).

| 사건 `type` | USER 관점 | TARGET 관점 |
|---|---|---|
| `KILL` (광대) | (광대시점)살인 이펙트 | (귀족시점)사망 이펙트 |
| `HEAL` (의사) | (주치의 및 귀족 시점)살리는 이펙트 | **같은 파일** |
| `INVESTIGATE` (경비원) | (경비원 시점)판별 이펙트 | 전용 파일 없음 — 기존 비공개 임시 연출 유지 |
| `CONFIRM` (마녀사냥꾼) | (마녀사냥꾼 시점)영혼수집 이펙트 | 전용 파일 없음 — 기존 비공개 임시 연출 유지 |

- USER·TARGET이 같은 사람(자기 치료)은 한 번만 재생한다. USER 시점 영상을 TARGET에게 돌려쓰지 않는다(조사자가 드러날 수 있다).
- 기존 `/video-direction/kill-animation.mp4`와 최종 사망 연출(`useInGameKillReveal`)은 그대로 둔다.

### 2-6. 브라우저 공통 재생 — stacked MP4 + canvas 합성 (F-27d, 2026-09-22)
F-27c의 웹 변환본(VP9 알파 WebM)은 Safari·iOS에서 알파가 나오지 않는다. 운영자가 같은 5개 영상을 **stacked-alpha MP4**(H.264 + AAC, 프레임의 위 절반 = 색, 아래 절반 = 알파 마스크)로도 변환해 저장소에 두었다(`c43d6c0d`): `frontend/public/video-direction/night-success-{kill-user,kill-target,heal,investigate-user,confirm-user}-stacked.mp4`.

- 재생 경로는 **하나**다: 모든 브라우저가 stacked MP4를 쓴다(VP9 알파 지원 여부를 감지해 갈라 쓰지 않는다 — 감지가 믿을 만하지 않고 경로가 둘이면 시험도 둘이다). 선택표(§2-5)의 역할·관점 → 자산 대응은 그대로이고 **경로만** `-stacked.mp4`로 바뀐다. 기존 `.webm` 5개는 지우지 않지만 화면이 요청하지 않는다.
- `<video>`는 화면에 보이지 않게 두고(소리와 시간축의 원천), 보이는 것은 `<canvas>`다. 매 프레임 video의 위 절반(색)과 아래 절반(마스크)을 합성해 canvas에 그린다 — canvas 크기는 video 가로 × (세로 ÷ 2). 합성 계산(색 픽셀 + 마스크 밝기 → 알파)은 DOM 없이 시험할 수 있는 순수 함수로 분리한다.
- 프레임 루프는 `requestVideoFrameCallback`이 있으면 그것을, 없으면 `requestAnimationFrame`을 쓴다. 표시 수명이 끝나면(F-27c의 lifetime cleanup) 루프를 반드시 취소한다.
- F-27c가 만든 것은 전부 그대로 둔다: 음량·음소거 적용(`applyMixToVideo`), 무음 latch, 자동재생 거부 재시도, 워치독, `settleOnce` 단일 종료 가드, COMPLETED·ERROR·SKIPPED 보고. 소리는 계속 video 요소에서 난다.
- canvas 2D 컨텍스트를 얻지 못하거나 합성이 던지면 → `ERROR` 1회 보고(밤 진행을 막지 않는다).
- 실제 Safari·iOS·Chrome에서의 합성 결과·성능은 자동 시험으로 확인할 수 없다 — 미검증으로 남기고 F-28에서 확인한다.

## 3. 조각별 담당

| 조각 | 담당 | 하지 않는 것 |
|---|---|---|
| **BZ — F-27a (서버)** | §2-1의 서버 수용(`outcome`, 허용 키 4개로 넓히고 F-26b의 "정확히 세 필드" 시험을 같이 고친다) · §2-2 게이트 전부 · §2-3의 서버 송신 | 프런트 **생산 코드**는 바꾸지 않는다(잠금 시험의 이름 등록만 예외). 연출 재생·대기 화면 |
| **CE — F-27b (화면 연출)** | §2-4 전부: 소비 훅, `completeNightSuccess`의 `outcome` 인자, 순서·두 연출 뒤 생존 표시·보고 | 서버 코드. 비수신자 대기 화면. 효과음·무음 정책. 재접속·마지막 밤 통합 |
| **BL — F-27 본 조각** | §2-3의 **화면 쪽**(`night_presentation_wait` 수신 → 비밀 정보 없는 대기 화면. 비수신자가 새로고침해도 대기 여부가 복원되게 기존 세션 스냅샷 응답에 `presentationWaiting: true｜false` 한 키를 싣는다 — 그 밖의 정보는 넣지 않는다) · 재접속(F-26 BK의 복원)·중복 이벤트·마지막 밤에서 연출이 잘리거나 멈추지 않는 통합 흐름 · 같은 밤 사건을 다음 낮에 다시 재생하지 않음 · **이 조각은 새 소리를 추가하지 않는다**(F-16 무음 정책 그대로) · F-27 통합 시험(임시 연출 기준) | BZ·CE가 만든 계약의 재설계. **영상 자산 변환·연결·내장음·개인 성공 효과음(F-27c)** |
| **F-27c — 역할 영상 연결 (F-28 직전에 추가)** | 수령한 MOV 5개의 웹용 변환본 연결(변환은 운영자가 ffmpeg로 미리 해서 저장소에 둔다 — 구현 AI는 변환하지 않는다) · 역할·USER/TARGET 관점별 자산 선택(§2-5의 확정표 그대로) · 내장 사운드 사용: Master×SFX와 음소거 설정 적용, **같은 사건에 내장음과 별도 성공 효과음을 중복 재생하지 않는다**, 별도 BGM·다른 출처 소리는 기존 무음 정책 유지 · `sfxManifest.js::SFX_MANIFEST`의 전용 kind 등록 · 자동재생 제한·오디오 오류가 밤 진행을 영구 대기로 만들지 않음(F-27b의 ERROR·SKIPPED 보고에 기댄다) · `SFX-DEFER-27`(`docs/requirements/2026-09-12-sfx-scope-split.md`)의 담당을 BL에서 이 조각으로 옮긴다 | 서버 계약. 연출 순서·보고(F-27b) |
| **F-27d — 브라우저 공통 재생 (F-28 직전에 추가)** | §2-6 전부: 선택표 경로를 stacked MP4로 교체 · 숨긴 video + canvas 합성 · 프레임 루프와 정리 · canvas 실패 → ERROR | 서버 계약. F-27c의 소리·재시도·보고 규칙 재설계. 영상 변환·재인코딩. 기존 `.webm` 삭제 |

## 4. 시험으로 고정할 것 (조각의 성공 조건이 가리키는 증명 방식)

| 계약 | 증명 방식 | 담당 |
|---|---|---|
| 모든 수신자 완료 → 정확히 1회 해제, 그 전에는 다음 역할·낮 타이머가 흐르지 않음 | 서버 소켓 시험(가짜 시계) — 수신자 2명 중 1명만 ACK → 미해제, 2명째 ACK → 해제 1회, 같은 ACK 재전송 → 추가 해제 0 | BZ |
| 미응답 상한 | 가짜 시계를 상한만큼 진행 → 해제 1회, 그 뒤 늦은 ACK는 기록만 | BZ |
| `outcome` 수용 | `ERROR`·`SKIPPED`도 해제에 포함, 허용 밖 값·여분 키 → `INVALID_PAYLOAD`, 없음 → `COMPLETED` | BZ |
| 비수신자 대기 알림의 수신자와 payload | 수신자별 실제 emit 관찰 — 비수신자만 `waiting:true/false`, payload 키 허용 목록 3개, 사건 없는 역할에서는 0건 | BZ |
| 마지막 밤 | 마지막 역할 해제 뒤에만 최종화 | BZ |
| 큐 순서대로 하나씩 연출, 끝나면 한 번 보고 | 실제 훅 마운트 시험 — 사건 2개 → 첫 연출 중 둘째 미시작, 완료 → ACK 1회 → 둘째 시작 | CE |
| 오류·건너뛰기 보고 | 재생 오류/건너뛰기 → `outcome` 실린 ACK 1회 | CE |
| 킬+치료 두 연출 뒤 생존 표시 | 훅/컴포넌트 시험 | CE |
| 대기 화면에 비밀 정보 없음 | 컴포넌트 시험 — 표시 문자열·DOM에 역할·대상·사건 ID 없음 | BL |
| 이 조각이 새 소리를 추가하지 않음(F-16 무음 정책 회귀) | 기존 F-16 시험 통과 | BL |
| 내장음의 볼륨·음소거 적용, 같은 사건의 내장음·효과음 중복 없음, 다른 소리 무음 유지 | 기존 F-16 시험 패턴 + 컴포넌트 시험 | F-27c |
| 자산 선택표대로 역할·관점별 영상이 선택되고 대상자 화면에 비공개 정보가 없음 | 컴포넌트 시험 | F-27c |
| 서버 게이트 + 화면 연출 + 재접속 복원 결합 | 통합 시험 | BL |

## 5. 열어 둔 것 (지금 확정하지 않는다)
- 미응답 상한의 최종 값 — 기본 12초로 구현하고 설정으로 바꿀 수 있게만 한다. 수령한 영상의 길이는 3.96~5.0초다.
- (확정됨 — §2-5)
- 실제 브라우저에서의 재생 확인 — F-28.
