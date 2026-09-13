# F-16 · 생산자 → 사건 ID → 수신자 → 소비처

기준 HEAD 30432445. **이 문서는 연결 설계의 기록이며 시험 통과·실제 청음 증거가 아니다.**
현재 배포 manifest는 모든 항목이 미검토라 아래 모든 사건은 "무음 + 사유 기록"으로 끝난다
(`frontend/src/shared/audio/sfxManifest.js`, AC-02).

## 이번 슬라이스에서 실제로 연결한 사건

| kind | 생산자(실제 코드 위치) | 안정 사건 ID | 수신자 | 프런트 소비처 |
| --- | --- | --- | --- | --- |
| `ui-click` | 브라우저 click(물리 입력) | `ui-click:<seq>` | 본인 | `useSfxRuntime.js` document capture 단일 소유자 |
| `ui-confirm` / `ui-cancel` | `data-sfx-kind` 표식 · `data-sfx-owner="explicit"` 제어 · form submit 경계 · native confirm 반환 경계 | `ui-confirm:<seq>` / `ui-cancel:<seq>` | 본인 | 같음. 제어별 전수 표는 `ui-ownership.md` |
| `day-vote-submitted` | `backend/socket/gameSession.js::handleSubmitDayVote` 성공 ACK | `game:<id>:day:<d>:round:<r>:actor:<uuid>:vote:<revision>` | 요청자 본인(ACK) | `useInGameDayVoteSubmit.js` (controller의 성공 정착 뒤 `onAccepted`) |
| `tribunal-vote-submitted` | `…::handleCastTribunalVote` 최초 성공 ACK | `game:<id>:day:<d>:actor:<uuid>:tribunal-submitted` | 요청자 본인(ACK) | `useInGameTribunalVoteSubmit.js` (`settleSuccess` 통과 뒤) |
| `friend-request-received` | `backend/controller/friend.controller.js::sendFriendRequest` | `friend-request:<requestId>:received` | `emitToUser(receiverId, …)` | `useFriendSocketEvents.js` |
| `friend-request-accepted` | `…::acceptRequest` | `friend-request:<requestId>:accepted` | `emitToUser(requesterId, …)` | 같음 |
| `friend-request-declined` | `…::declineRequest` | `friend-request:<requestId>:declined` | `emitToUser(requesterId, …)` | 같음 |
| `achievement-granted` | `backend/services/achievementService.js::notifyAchievementGranted` (각 commit 직후) | `achievement:<definitionId>:granted` | `emitToUser(userId, …)` | `useSfxRuntime.js`의 `achievement_granted` 구독 |
| `room-ready-changed` | `backend/socket/matchmaking.js::handleSetReady` (실제 변경에만, revision 증분) | `room:<roomId>:ready:<uuid>:<revision>` | 방송(요청자 제외) + 요청자 ACK | `useMatchingRoom.js` `handlePlayerReadyChanged` / `setReady` 성공 ACK |
| `game-started` | `backend/socket/matchmaking.js::handleStartGame`의 참가자별 `game_started` | `game:<gameId>:started` | 참가자 각자 | `useMatchingRoom.js` `handleGameStarted` |
| `game-phase-changed` | `game_phase_changed` 방송 | `game:<id>:phase:<phase>:<dayIndex>` | 세션 channel | `useGameSessionSocketEvents.js` (store 반영 성공 시에만) |
| `day-phase-changed` | `day_phase_changed` 방송 | `game:<id>:day:<d>:dayphase:<dayPhase>` | 세션 channel | 같음 |
| `night-turn-started` | `night_turn_started` 방송 | `game:<id>:day:<d>:nightturn:<role>` | 세션 channel | 같음 |
| `day-vote-resolved` | `day_vote_resolved` 방송 | `game:<id>:day:<d>:round:<r>:day-resolved` | 세션 channel | 같음 |
| `tribunal-vote-resolved` | `tribunal_vote_resolved` 방송 | `game:<id>:day:<d>:tribunal-resolved` | 세션 channel | 같음 |
| `night-private-result` | `backend/socket/gameSession.js::handleResolveNight` 수신자별 emit (INVESTIGATE·CONFIRM) | `game:<id>:night:<d>:<actionType>` | `recipientSocket` 1인 | 같음 (`parseInGameNightPrivateResultPayload` 통과 후) |
| `night-private-failure` | 같은 경계 (ASSASSINATE `success:false`) | `game:<id>:night:<d>:ASSASSINATE` | 같음 | 같음 — 실패를 성공음으로 바꾸지 않는다 |
| `player-eliminated` | `backend/socket/gameSession.js::expireDisconnectGrace` | `game:<id>:day:<d>:victim:<uuid>:eliminated` | 세션 channel | `useGameSessionSocketEvents.js` (신규 소비처) |
| `game-result` | terminal 반영 경로 3종(밤 결과·재판 판정·끊김 사망) | `game:<id>:result` | 세션 channel | 같음 — 한 게임에 ID 하나라 경로가 달라도 1회 |

### 소리를 만들지 **않는** 경로 (A-05 복구/조회)

`fetchIncomingRequests` · `fetchFriends` · `removeSentRequest` · `getStatusForUser` ·
`get_current_room` · `get_session_snapshot`(`useInGameSessionSnapshotSync` →
`bootstrapSessionSnapshot`/`applySessionSnapshot`) · `GameResultPage` 진입 ·
`?outcome=` 미리보기 · `friend_status_change` · `game_ended`(세션 정리 전용).

## 후속 담당으로 남긴 미완료 (F-16에서 구현하지 않음)

| 항목 | 담당 | 상태 |
| --- | --- | --- |
| 신규 시스템 알림 연결 | F-17 (SFX-DEFER-17=BB) | **미완료** — 실 DB 시험과 실제 외부 Chrome은 수행됐으나(아래 F-17 절), 브라우저에서 재현된 시각 결함의 보수분 재확인과 실제 청음이 남았다 |
| 실제 게임 초대 | F-19 (SFX-DEFER-19=BD) | 미완료 |
| 전체 개인 능력 영상 동기 · 승인 MOV 5개 내장음 실제 연결 | F-27 (SFX-DEFER-27=BL) | 미완료 |
| 통합 인수 | F-28 (SFX-INTEGRATION-28=BN) | 미완료 |

F-16이 F-27에 제공하는 것은 `claimAudio(event, { mode: 'embedded' })` · `getMix()` ·
`subscribeMix()` 계약뿐이다. MOV 실제 변환·청음·동기 연결은 여기서 검증하지 않았고
완료로 기록하지 않는다. 최대 2초 길이 제한은 **별도 SFX 전용**이며 4~5초 내장음에는
적용하지 않는다.

## F-17(SFX-DEFER-17) 이관 증거 — 신규 시스템 알림

**상태: 미완료.** 아래 연결은 자동 시험으로 확인했고, 실제 생산·수신·화면은 운영자의 실제
외부 Chrome에서도 확인됐다(후보 `0c2cfe87`, `docs/test-evidence/f17/browser-2026-09-13.md`).
그러나 **실제 청음은 아니다** — 배포 manifest의 `system-notification`은 여전히 미검토라
매체를 만들지 않는다. 아래 "재생 1회"는 전부 시험 전용 fixture + 주입 매체의 `playCalls`
기록이고, 이것을 실제 청음 증거로 기록하지 않는다. 브라우저에서 재생 횟수를 센 기록도 없다.
그 Chrome 확인에서 **긴 목록 시각 결함 1건이 재현**됐고, 보수 후 **재확인이 아직 남아 있다.**

| 항목 | 값 |
| --- | --- |
| kind | `system-notification` (scope=account, notificationKey=`system-notification`) |
| 생산자 | `backend/service/notification.service.js::ensureSystemWelcome` |
| 생산 트리거 | `backend/socket/socket.js::registerNotificationHandlers`의 `notifications_ready` (세션 가드 통과 + `onlineUsers`의 현재 소켓 일치일 때만) |
| 준비 신호 조건 | 수신 훅이 **그 접속에서** 목록 복원을 마쳤을 때만 1회. 접속 세대별로 재동기화하고, ACK가 없으면 제한 시간 뒤 최대 3회까지만 재시도한다(`useNotificationSocketEvents.js`) |
| 안정 사건 ID | `notification:<notifications.id>` — 서버가 저장한 행 id (원본 중복 키는 `UNIQUE(user_id, source_key)`의 `system:notifications-available:v1`) |
| 수신자 | `emitToUser(<검증된 계정 uuid>, 'notification_created', …)` |
| 프런트 수신 | `frontend/src/domains/notifications/hooks/useNotificationSocketEvents.js` |
| 최종 소비처 | `useNotificationsStore` → `NotificationModal.js` 목록 · `NotificationEntryButton.js` 미확인 수 |
| 자산/무음 사유 | `sfxManifest.js`의 `pendingAsset` — `asset-unreviewed`, "자산 파일과 이용 조건 검토가 아직 제공되지 않았다" |
| 실 DB 시험 | 운영자 공식 VERIFY-11..15의 격리 DB 직렬 backend **1546 PASS 0 skip**(후보 `0c2cfe87`) — `f17-notifications.integration.test.js` 27건 포함 |
| 실제 Chrome | 운영자 수행, 2026-09-13(후보 `0c2cfe87`) — 기능 13항목 통과 · 시각 결함 1건 재현 → `docs/test-evidence/f17/browser-2026-09-13.md` |
| 담당 상태 | **미완료** — 실제 청음 없음(자산 미검토), 화면 결함 보수분의 브라우저 재확인 미수행 |

### 소리 소유권(한 사건에 한 번)

- 친구·업적의 `notification_created`에는 서버가 **sfxEvent를 싣지 않는다** — 그 소리는 기존
  `friend_request_received` · `achievement_granted`가 계속 소유한다. 알림 쪽은 목록만 바꾼다.
- 세 종류 모두 `useNotificationsStore.consumeSoundEvent(accountId, sourceKey)`를 통과한다.
  SFX 봉투의 `eventId`가 곧 서버 `source_key`와 같은 문자열이라 별도 매핑이 없다
  (`friend-request:<id>:received` · `achievement:<id>:granted` · `notification:<행 id>`는
  시스템만 행 id를 쓴다 — 시스템의 원본 키 소모는 `source_key`로 한다).
- **목록 upsert는 소리 표식을 소모하지 않는다.** 그래야 친구 알림 행이 먼저 도착해도
  뒤이은 `friend_request_received`가 최초 소리를 잃지 않는다.

### 소리를 만들지 **않는** 경로 (F-17)

`GET /notifications` · 초기 복원 · 복원 전 버퍼 병합 · 재접속 재동기화(그 구간에 도착한
알림 사건 포함) · `PATCH …/read` · `notifications_ready` 재시도 · 표시 설정 재활성화.

복원 경계는 **알림 행으로 남는 사건 키**(`friend-request:<id>:received` ·
`achievement:<id>:granted` · `system:*`)에만 적용한다. 알림 행이 없는 기존 사건
(`friend-request:<id>:accepted|declined` 등)은 복원이 알 수 없으므로 그 구간에도 최초
소리를 잃지 않는다(`notifications.store.js::isNotificationBackedSourceKey`).

**복원 실패도 해소가 아니다(CODEX-2 보수).** 예전 구현은 `loadSnapshot`의 catch에서
`restorePending`을 내렸다 — 그러면 서버 목록을 **한 번도 받지 못한** 상태인데도 경계가
풀려서, 그 뒤 늦게 배달된 **과거** 업적·친구 수신 사건이 `useSfxRuntime` ·
`useFriendSocketEvents`를 통해 다시 울렸다(알림 훅 자체는 `liveBuffer`가 막으므로 이
구멍은 그 두 기존 소비처로만 드러난다). 실패한 GET의 "목록에 없음"은 새 사건의 증거가
아니므로, 이제 `restorePending`은 **성공한 복원만** 내린다. 영구 무음은 아니다 — 화면의
재시도가 성공하면 해소되고, snapshot에 담긴 과거 키는 `soundSeen`으로 확정되며, 그 뒤의
진짜 새 사건은 정상적으로 1회 울린다. 수락·거절 같은 알림 행 없는 제어 사건은 애초에 이
경계의 대상이 아니라 조회 실패와 무관하게 최초 소리를 유지한다. 이 경계는 소리 적격성에만
쓰이므로 읽음·이동·닫기·재시도를 잠그지 않는다.

### 화면 결함 보수 (2026-09-13 실제 Chrome 재현분)

운영자의 실제 Chrome(1920×855, 알림 4행)에서 모달을 열면 초점이 맨 아래 닫기 버튼으로 가고
**안쪽 영역 전체**가 `scrollTop 270`까지 끌려 내려가, 제목과 가장 새 알림이 화면 위로 밀리고
행들이 양피지 그림 밖에 그려졌다(`scrollHeight 743 / clientHeight 427`).

고친 것은 **알림 레이아웃뿐**이다. 소리 경계·읽음·이동·계정 정리 계약은 건드리지 않았다.

- `NotificationModal.js` — 제목(고정) · 목록(`min-h-0 flex-auto overflow-y-auto` 단독 스크롤) ·
  닫기(고정)의 3단 구조. 스크롤하는 상자가 목록 하나뿐이라 초점 이동이 바깥을 끌어내리지 못한다.
- `ingameParchmentModalVariants.js` — **알림 variant만** 자기 안쪽 영역 치수를 갖는다
  (`inset-x-[15%] inset-y-[13.5%] overflow-hidden`). 공용 `py-[17%]`는 CSS 규칙상 세로 여백도
  프레임 **가로폭**의 17%라 3:2 그림에서 높이의 25.5%를 먹었다 — inset은 높이 기준이라 같은
  안전 영역을 지키면서 실제로 쓸 수 있는 높이가 늘어난다. 프레임은 역할 공개와 같은 48rem급.
- `InGameParchmentModalBase.js` / `InGameParchmentPanelBase.js` — variant가 준 안쪽 영역 기본
  클래스를 전달한다. **넘기지 않는 다른 모달 4종은 기존 공용 기본값 그대로**다(시험으로 고정).
  클래스를 덧붙이는 방식으로는 못 고친다 — `overflow`·`inset`·`padding`은 Tailwind 생성 순서가
  승자를 정해서 문자열 뒤에 붙여도 이기지 않는다(기존 `justify-start`가 실제로 무시되고 있었다).

회귀 시험 4건을 `NotificationModal.test.js`에 추가했다(6행 목록에서 제목·닫기가 스크롤 영역
**밖**의 형제인지, 6행 전부가 스크롤 영역 안인지, 초점이 스크롤되지 않는 닫기에 있고 목록이
맨 위인지, 이미지 실패 대체 패널도 같은 3단 구조인지, 다른 variant가 그대로인지).
브라우저 재확인은 운영자 관문으로 **남아 있다.**

### 검증 기록 (누가 · 언제 · 무엇을)

같은 명령이라도 **누가 어느 커밋에서 돌렸는지**를 구분해 남긴다. 앞선 성공 기록은 그
시점의 코드에 대한 것이고, 이후 변경을 검증하지 않는다.

| 주체 / 시점 | 대상 | 결과 |
| --- | --- | --- |
| 구현자(worker), 최초 구현 세션 | `npm test --prefix frontend` | 1704 PASS |
| 구현자(worker), 최초 구현 세션 | `npm test --prefix backend` | 1371 PASS · **154 skip**(격리 DB 없음) |
| 구현자(worker), 최초 구현 세션 | `npm run build --prefix frontend` | PASS |
| **운영자 공식 VERIFY-1..5, 01:21–01:33 KST, 후보 `0b04970f6d7c34b89a6000750e9b5e36a6774a75`** | 설치 2건 · frontend · build · 격리 DB 직렬 backend | frontend **1704 PASS 0 skip** · build **PASS** · backend **1525 PASS 0 skip**(698914ms) |
| 구현자(worker), 이번 보수 세션(R-IMPL #1~#6) | `npm test --prefix frontend` | **1736 PASS 0 skip** |
| 구현자(worker), 이번 보수 세션 | `npm run build --prefix frontend` | **PASS** |
| 구현자(worker), 이번 보수 세션 | `npm test --prefix backend` | **1385 PASS · 161 skip**(격리 DB 없음) |
| **운영자 공식 VERIFY-6..10, 후보 `e259a538`** | frontend · build · 격리 DB 직렬 backend | frontend **1736 PASS 0 skip** · build **PASS** · backend **1546 PASS 0 skip** |
| 구현자(worker), CODEX-2 보수 세션(복원 실패 경계) | `npm test --prefix frontend` | **1737 PASS 0 fail 0 skip** |
| 구현자(worker), CODEX-2 보수 세션 | `npm run build --prefix frontend` | **PASS** (`✓ built`) |
| 구현자(worker), CODEX-2 보수 세션 | 변이 검사(고친 줄을 되돌려 봄) | 새 마운트 시험이 `playCalls: ['/fixture/achievement-granted.wav']`로 **실패** — 경계가 실제로 들리는 회귀를 잡는다 |
| **운영자 공식 VERIFY-11..15, 후보 `0c2cfe87`** | 설치 2건 · frontend · build · 격리 DB 직렬 backend | 설치 **PASS** · frontend **1737 PASS 0 fail 0 skip** · build **PASS** · backend **1546 PASS 0 fail 0 skip** |
| **운영자, 실제 외부 Chrome, 2026-09-13 09:45–10:05 KST, 후보 `0c2cfe87`** | 실제 Vite 5183 · API 4183 · 격리 `pluto_f01_20260909_al` | 기능 관찰 13항목 통과 · **시각 결함 1건 재현**(아래) — `docs/test-evidence/f17/browser-2026-09-13.md` |
| 구현자(worker), 화면 결함 보수 세션(2026-09-13) | `npm test --prefix frontend` | **1741 PASS 0 fail 0 skip**(직전 1737 → 긴 목록·초점·대체 패널·다른 variant 불변 시험 4건 추가) |
| 구현자(worker), 화면 결함 보수 세션 | `npm run build --prefix frontend` | **PASS** (`✓ built`) — 새 임의값 유틸리티(`inset-y-[13.5%]` 등)가 실제 산출 CSS에 생성된 것까지 확인 |
| 구현자(worker), 화면 결함 보수 세션 | 변이 검사(`parchmentContentBaseClass`를 되돌려 봄) | 새 시험 2건이 "안쪽 영역 자체는 스크롤하지 않는다"·"알림만 자기 치수를 갖는다"로 **실패** — 결함 구조를 실제로 잡는다 |

- 운영자 VERIFY-6..10의 결과는 **후보 `e259a538`의 코드**에 대한 것이다. CODEX-2 보수에서
  바뀐 `notifications.store.js`와 시험 2건은 그 실행에 포함되지 않았다 — 운영자가 격리 DB
  래퍼로 다시 돌리기 전까지 그 부분은 **미검증**이다. backend는 이번 보수에서 **바뀌지
  않았다**(변경 파일 3개 전부 frontend).
- 운영자 VERIFY의 backend 1525 PASS 0 skip은 **후보 0b04970f의 코드**를 검증한 것이다.
  이번 보수 세션에서 바뀐 코드와 새로 추가한 DB 시험 7건은 그 실행에 포함되지 않았다 —
  다시 돌리기 전까지 **미검증**이다.
- **위 worker skip 기록(154·161건)은 그 시점 작업 환경의 역사적 사실로 남긴다** — worker
  환경에는 `F01_TEST_DATABASE_URL`이 없어 `f17-notifications.integration.test.js` 27건
  (기존 20 + 신규 7)이 skip이었다. 그 27건은 실제 세션 가드 경로
  (`wrapSocketWithSessionGuard` → `registerNotificationHandlers`,
  `registerConnectionHandlers`)와 0012 verify의 인덱스 컬럼·FK 거부를 실제 MySQL에서
  확인한다. **운영자 공식 VERIFY-11..15(후보 `0c2cfe87`)의 격리 DB 직렬 실행에서 backend
  1546건이 0 skip으로 통과했으므로 그 27건은 실제로 실행됐다** — "한 번도 실행되지 않았다"는
  더 이상 현재 상태가 아니다.
- 다만 그 공식 실행은 **후보 `0c2cfe87`의 코드**에 대한 것이다. 그 뒤 화면 결함 보수에서 바뀐
  파일(frontend 4 + 시험 1)은 포함되지 않았다 — 운영자가 다시 돌리기 전까지 그 부분은
  **미검증**이다. 이번 보수에서 backend는 **바뀌지 않았다**.

### 이번에 확인한 것 / 확인하지 못한 것

- 확인함(자동 시험, 격리 DB 불필요):
  `frontend/src/domains/notifications/hooks/__tests__/notificationSocketEvents.test.js`
  (실제 훅을 마운트해 connect/disconnect·접속 세대·늦은 ACK·ACK timeout 상한·소켓 교체·
  cleanup·실제 `dispatchSfxEvent` 경로를 확인, **14건** — CODEX-2 보수로 "초기 복원 실패 →
  늦게 배달된 과거 업적 사건" 1건 추가. 이 시험은 `useNotificationSocketEvents`와 **실제
  업적 소리 소유자인 `useSfxRuntime`을 함께 마운트**하고 `socketClient.setSocket`으로 전송만
  꽂아, 핸들러를 복제하지 않고 실제 라우팅을 태운다),
  `.../hooks/__tests__/notificationRuntime.test.js`(store·재생기 계약, 40건 — 복원 실패 뒤
  과거 키 거절·반복 지연 배달·수락/거절 제어 사건 유지·재시도 성공 후 억제 및 신규 1회를
  한 시험에서 순서대로 확인),
  `frontend/src/domains/lobby/hooks/__tests__/lobbyNotificationPanels.test.js`
  (실제 모달·진입 버튼을 마운트한 계정 전환·지연 PATCH·같은 대상 재진입, 6건),
  `.../components/__tests__/NotificationModal.test.js`,
  `frontend/src/shared/audio/__tests__/sfxPlayer.test.js`의 F-17 절,
  `backend/__tests__/notifications.migration.test.js`(0012 verify의 인덱스 컬럼·FK·
  NULL 계약 거부와 데이터 보존, 14건), `backend/services/achievementService.test.js`의 F-17 절.
- **worker 환경에서 확인하지 못함**: `backend/tests/db/f17-notifications.integration.test.js`
  27건. `F01_TEST_DATABASE_URL`이 없어 skip이었다. **운영자 공식 VERIFY-11..15가 격리 DB에서
  이 27건을 포함해 backend 1546건을 0 skip으로 통과시켰다**(후보 `0c2cfe87`).
- **운영자가 실제 외부 Chrome을 수행했다**(2026-09-13, 후보 `0c2cfe87`) —
  `docs/test-evidence/f17/browser-2026-09-13.md`. 실제 시스템 안내 생산·수신, 친구 요청과
  대상 이동·수락, 새로고침 없는 live 배지 갱신, 업적 지급 후 즉시 표시와 서고 이동,
  조회 실패·읽음 실패 화면, 표시 off/mute와 **원본 데이터 보존**, 계정 경계까지 실제 화면에서
  확인됐다. 동시에 **시각 결함 1건이 재현**됐다(긴 목록에서 초점이 안쪽 영역 전체를
  `scrollTop 270`으로 끌어내려 제목·최신 행이 밀리고 닫기 버튼이 화면 밖으로 나감).
  이번 보수는 그 결함만 고쳤다(알림 variant 치수 + 고정 제목/닫기 + 단독 스크롤 목록).
  **고친 화면의 브라우저 재확인(같은 뷰포트·확대 글자)은 아직 수행되지 않았다** — 그 전까지
  브라우저 확인을 완료로 기록하지 않는다.
- **확인하지 못함**: 실제 자산 청음(자산 자체가 미검토다). 브라우저에서 Audio 생성·재생
  횟수를 센 기록도 없다. 단위·통합 시험 통과를 청음으로 기록하지 않는다.
- 위 "재생 1회" 기록은 전부 **시험 전용 승인 fixture + 주입 매체의 `playCalls`**다. 배포
  manifest의 `system-notification`은 여전히 `needs-review`이며, 그 상태에서는 Audio 생성 0·
  재생 0·`asset-unreviewed` 사유 기록으로 끝난다는 것을 별도 시험으로 확인했다.
  모의 재생을 실제 청음으로 기록하지 않는다. **SFX-DEFER-17은 계속 미완료다.**

## 투표 제출 사건의 중복 규칙 (AC-04)

- **낮 투표**: `backend/game-core/gameSession.js`의 세션 안에 actor별
  `{dayIndex, round, targetId, revision, eventId}`를 둔다. revision은 **최초 제출(기권 null
  포함)과 대상 변경**에만 오른다 — 같은 대상 재요청은 같은 eventId라 소리가 0이다.
  A→B→A는 revision 1·2·3의 서로 다른 실제 변경이다(uuid+target 키였다면 세 번째가 첫 번째와
  같은 키로 묻힌다). 재투표(새 round)와 다음 날은 각각 별도 범위이고 revision이 1부터 다시
  시작한다. 실패한 제출은 `dayVotes`와 마찬가지로 이 메타데이터도 건드리지 않는다.
- **소켓 캡처 순서**: 핸들러는 core 성공 **직후·DB await 이전**에 봉투를 캡처한다. 그 뒤
  같은 actor가 다시 제출해도 game-core가 새 불변 객체로 교체하므로, 늦게 끝난 DB 응답이
  다음 제출의 ID를 싣지 않는다. **DB 실패 ACK(`VOTE_PERSIST_FAILED`)에는 봉투가 없다.**
- **F-11 DB 참여 집계와 별개다** — 2라운드 이상의 제출은 집계에 기여하지 않지만 사건은 있다.
- **재판 투표**: 중복은 `TRIBUNAL_VOTE_ALREADY_SUBMITTED` 실패이므로 최초 성공 1회뿐이고
  revision이 필요 없다. 실패 ACK에는 봉투를 붙이지 않는다.
- **프런트 재검증**: 두 훅 모두 성공 정착 뒤 ACK echo(gameId/dayIndex) · 소켓 identity·
  connected · 현재 인증 계정 == 봉투 accountId · 최신 `getState()`의 게임/날짜/라운드/phase/
  actor 본인/생존을 다시 확인한 뒤에만 dispatch한다. 어긋나면 **투표 상태의 의미는 그대로,
  소리만 0**이다.
- 봉투에는 투표 대상·투표 내용·역할을 담지 않는다(AC-05).
