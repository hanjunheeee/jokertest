# F14~F23 회차별 계획 기록표

집계 2026-09-18 20:11:18 KST · PLAN 121건 + CLAUDE-PLAN 12건 = 133건

호출 시각은 원본 at을 KST로 변환했다. “시간”은 해당 호출의 durationMs이고, 결과 칸은 준비 판정 또는 계획 심사 판정이다. 요약은 가독성을 위해 축약했으며 원문은 링크에서 확인한다. `model`은 원본 메타데이터를 그대로 표시하므로 엔진 로그상의 심사자 이름과 혼동하지 않는다.

## F14 (AY) — F-14 구매 스킨·카드 장착

| 기록·원문 | 기록 시각 KST | model 메타데이터 | 종류 | 시간(분) | 결과 | 핵심 내용 |
|---|---|---|---|---:|---|---|
| [PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/PLAN-1.json>) | 2026-09-12 03:06:44 | codex | 후보 확장 요청 | 1.2 | 중간 탐색 | 확장 대상 10개: backend/service/economy.service.js, backend/routes/economy.routes.js, backend/game-core/gameSession.js |
| [PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/PLAN-2.json>) | 2026-09-12 03:07:47 | codex | 후보 확장 요청 | 1.0 | 중간 탐색 | 확장 대상 5개: backend/models/economy/economy.model.js, backend/economy/catalog.js, backend/socket/gameSession.js |
| [PLAN-3.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/PLAN-3.json>) | 2026-09-12 03:08:56 | codex | 본문 확인 요청 | 1.1 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/PLAN-4.json>) | 2026-09-12 03:10:34 | codex | 계획안 | 1.6 | 준비 판정 필드 없음 | 성공조건 6개, 선택 코드 6개, 신규 항목 0개 |
| [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/CLAUDE-PLAN-1.json>) | 2026-09-12 03:11:32 |  | 독립 계획 심사 | 1.0 | PASS | All six selected entities exist in the working tree exactly as described (equipItem at backend/service/economy.service.js:651 with catalog+ownership rejection ITEM_NOT_OWNED, skinCardWear.store.js with applyLoadout/reset and a frontend-only… |
| [PLAN-5.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/PLAN-5.json>) | 2026-09-12 03:50:05 | codex | 후보 확장 요청 | 1.9 | 중간 탐색 | 확장 대상 10개: backend/service/economy.service.js, frontend/src/domains/user/store/skinCardWear.store.js, frontend/src/domains/user/hooks/useSkinCardWearSelection.js |
| [PLAN-6.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/PLAN-6.json>) | 2026-09-12 03:52:12 | codex | 후보 확장 요청 | 2.1 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/matching/hooks/useMatchingRoom.js, frontend/src/domains/game/ingame/store/ingameStore.js, frontend/src/domains/game/ingame/store/applySessionSnapshot.js |
| [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/PLAN-7.json>) | 2026-09-12 03:53:11 | codex | 본문 확인 요청 | 1.0 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-8.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/PLAN-8.json>) | 2026-09-12 03:56:15 | codex | 계획안 | 3.1 | 준비 판정 필드 없음 | 성공조건 6개, 선택 코드 17개, 신규 항목 0개 |
| [CLAUDE-PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/AY/runs/CLAUDE-PLAN-2.json>) | 2026-09-12 03:57:50 |  | 독립 계획 심사 | 1.6 | PASS | All six acceptance criteria are covered by verified existing entities, the plan's factual claims match the current tree (frontend-only skinCardWear store, no accountSkinsByJob in backend, migrations ending at 0010, no per-job skin loadout c… |

## F15 (AZ) — F-15 통합 일반·채팅 설정

| 기록·원문 | 기록 시각 KST | model 메타데이터 | 종류 | 시간(분) | 결과 | 핵심 내용 |
|---|---|---|---|---:|---|---|
| [PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/AZ/runs/PLAN-1.json>) | 2026-09-12 09:22:11 | codex | 후보 확장 요청 | 0.8 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/settings/components/tabs/GeneralSettingsTab.jsx, frontend/src/domains/settings/constants/generalSettings.js, frontend/src/domains/settings/store/settingsStore.js |
| [PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/AZ/runs/PLAN-2.json>) | 2026-09-12 09:23:31 | codex | 후보 확장 요청 | 1.3 | 중간 탐색 | 확장 대상 7개: frontend/src/domains/game/ingame/components/controls/ingameSetting/SettingPanelContent.jsx, frontend/src/domains/game/ingame/components/controls/ingameSetting/SettingSoundTab.jsx, frontend/src/domains/game/ingame/constants/control… |
| [PLAN-3.json](<C:/Users/minsa/jokertest/.pluto/slices/AZ/runs/PLAN-3.json>) | 2026-09-12 09:24:35 | codex | 본문 확인 요청 | 1.1 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/slices/AZ/runs/PLAN-4.json>) | 2026-09-12 09:26:01 | codex | 계획안 | 1.4 | 준비 판정 필드 없음 | 성공조건 6개, 선택 코드 6개, 신규 항목 0개 |
| [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/AZ/runs/CLAUDE-PLAN-1.json>) | 2026-09-12 09:26:44 |  | 독립 계획 심사 | 0.7 | PASS | All selected entities exist in the current tree with the claimed behaviors, every acceptance criterion is mapped to a sensible connection point, and the plan's assumptions and unsure entries accurately reflect what remains to be verified. |

## F16 (BA) — F-16 효과음 전체·사운드 설정·금지 음악 무음 유지

| 기록·원문 | 기록 시각 KST | model 메타데이터 | 종류 | 시간(분) | 결과 | 핵심 내용 |
|---|---|---|---|---:|---|---|
| [PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-1.json>) | 2026-09-12 17:49:24 | codex | 후보 확장 요청 | 1.0 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/settings/store/settingsStore.js, frontend/src/domains/settings/components/tabs/SoundSettingsTab.jsx, frontend/src/domains/game/ingame/components/controls/ingameSetting/SettingSoundTab.jsx |
| [PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-2.json>) | 2026-09-12 17:50:13 | codex | 본문 확인 요청 | 0.8 | 중간 탐색 | 본문 확인 대상 3개 |
| [PLAN-3.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-3.json>) | 2026-09-12 17:56:41 | codex | 계획안 | 6.5 | 준비 미완료 | AC-01·AC-04: frontend/src/domains/game/mode/hooks/useRoomInvitePage.js::useRoomInvitePage와 backend/socket/matchmaking.js::registerMatchmakingHandlers에서 확인한 경로는 방코드 입장이다; 실제 게임 초대의 발신 UI→서버 사건 ID→수신 UI→효과음과 테스트 계약을 확정해야 한다. / AC-01·AC-04: fr… |
| [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-4.json>) | 2026-09-12 18:07:59 | codex | 후보 확장 요청 | 1.9 | 중간 탐색 | 확장 대상 10개: frontend/src/app/App.jsx, frontend/src/domains/settings/store/settingsStore.js, frontend/src/domains/lobby/hooks/useFriendSocketEvents.js |
| [PLAN-5.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-5.json>) | 2026-09-12 18:10:10 | codex | 후보 확장 요청 | 2.2 | 중간 탐색 | 확장 대상 10개: frontend/src/shared/ui/CheckBox.jsx, frontend/src/shared/ui/Stepper.jsx, frontend/src/shared/ui/RangeSlider.jsx |
| [PLAN-6.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-6.json>) | 2026-09-12 18:10:56 | codex | 본문 확인 요청 | 0.8 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-7.json>) | 2026-09-12 18:18:13 | codex | 계획안 | 7.3 | 준비 미완료 | AC-01·AC-04: CheckBox.jsx::CheckBox, Stepper.jsx::Stepper와 useGameSetupPage.js::goBackToMultiplay, useInGameExit.js의 createExitConfirmController 호출, DiscordAccountLink.jsx의 window.confirm 및 전체 모달·폼 확인·취소 소비처를 끝까지 확인하여 공통 클릭과 의미별 소리의 단일 책임·테… |
| [PLAN-8.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-8.json>) | 2026-09-12 18:27:02 | codex | 후보 확장 요청 | 1.9 | 중간 탐색 | 확장 대상 10개: frontend/src/app/App.jsx, frontend/src/domains/settings/store/settingsStore.js, backend/controller/friend.controller.js |
| [PLAN-9.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-9.json>) | 2026-09-12 18:28:43 | codex | 후보 확장 요청 | 1.7 | 중간 탐색 | 확장 대상 10개: backend/controller/friend.controller.js, frontend/src/domains/lobby/hooks/useFriendSocketEvents.js, frontend/src/domains/game/matching/hooks/useMatchingRoom.js |
| [PLAN-10.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-10.json>) | 2026-09-12 18:29:49 | codex | 본문 확인 요청 | 1.1 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-11.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-11.json>) | 2026-09-12 18:41:16 | codex | 후보 확장 요청 | 2.0 | 중간 탐색 | 확장 대상 10개: frontend/src/app/App.jsx, backend/controller/friend.controller.js, frontend/src/domains/lobby/hooks/useFriendSocketEvents.js |
| [PLAN-12.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-12.json>) | 2026-09-12 18:43:27 | codex | 후보 확장 요청 | 2.2 | 중간 탐색 | 확장 대상 10개: backend/socket/matchmaking.js, backend/socket/socket.js, frontend/src/domains/settings/components/tabs/SoundSettingsTab.jsx |
| [PLAN-13.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-13.json>) | 2026-09-12 18:44:44 | codex | 본문 확인 요청 | 1.3 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-14.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-14.json>) | 2026-09-12 18:53:11 | codex | 계획안 | 8.4 | 준비 미완료 | AC-01/AC-04: frontend/src/domains/game/ingame/components/parchment/InGameParchmentModalBase.js·InGameParchmentModalAnimated.jsx의 onDismiss/Escape, utils/createExitConfirmController.js 및 useMatchingRoom.js::settleFailed·useGameSetupPage.js::… |
| [PLAN-15.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-15.json>) | 2026-09-12 18:55:15 | codex | 후보 확장 요청 | 2.0 | 중간 탐색 | 확장 대상 10개: frontend/src/app/App.jsx, frontend/src/domains/settings/store/settingsStore.js, frontend/src/shared/hooks/useAudioControl.js |
| [PLAN-16.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-16.json>) | 2026-09-12 18:57:03 | codex | 후보 확장 요청 | 1.8 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/matching/hooks/useMatchingRoom.js, frontend/src/domains/game/ingame/hooks/useGameSessionSocketEvents.js, backend/socket/matchmaking.js |
| [PLAN-17.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-17.json>) | 2026-09-12 18:59:02 | codex | 본문 확인 요청 | 2.0 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-18.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/PLAN-18.json>) | 2026-09-12 19:06:29 | codex | 계획안 | 7.5 | 준비 미완료 | 현재 후보 상세에 frontend/src/domains/game/matching/hooks/useMatchingRoom.js::useMatchingRoom과 frontend/src/domains/game/ingame/hooks/useGameSessionSocketEvents.js::useGameSessionSocketEvents의 공식 ID가 없다. 잠금 H0042·H0014와의 대응 또는 대체 후보 ID를 확인해야 한다. /… |
| [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/CLAUDE-PLAN-1.json>) | 2026-09-12 19:13:53 |  | 독립 계획 심사 | 2.9 | 호출 실패 | API Error: Unable to connect to API (ConnectionRefused) |
| [CLAUDE-PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BA/runs/CLAUDE-PLAN-2.json>) | 2026-09-12 19:17:18 |  | 독립 계획 심사 | 1.8 | PASS | All plan claims verified against the working tree — selected entities exist and behave as described (friend controller empty payload/byUuid at backend/controller/friend.controller.js:42-74, settings defaults master=100/sfx=80 via SOUND_SETT… |

## F17 (BB) — F-17 알림 모달·읽음·발생 이벤트

| 기록·원문 | 기록 시각 KST | model 메타데이터 | 종류 | 시간(분) | 결과 | 핵심 내용 |
|---|---|---|---|---:|---|---|
| [PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-1.json>) | 2026-09-12 22:47:15 | codex | 후보 확장 요청 | 2.3 | 중간 탐색 | 확장 대상 10개: backend/controller/friend.controller.js, backend/services/achievementService.js, frontend/src/app/App.jsx |
| [PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-2.json>) | 2026-09-12 22:49:17 | codex | 후보 확장 요청 | 2.0 | 중간 탐색 | 확장 대상 10개: backend/service/friend.service.js, backend/socket/socket.js, frontend/src/domains/auth/store/auth.store.js |
| [PLAN-3.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-3.json>) | 2026-09-12 22:50:16 | codex | 본문 확인 요청 | 1.0 | 중간 탐색 | 본문 확인 대상 5개 |
| [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-4.json>) | 2026-09-12 22:56:55 | codex | 계획안 | 6.6 | 준비 미완료 | 공식 AC-01~06에 docs/requirements/2026-09-12-sfx-scope-split.md::SFX-DEFER-17의 신규 생산·수신·F16 연결 및 무음/중복/계정/off/mute/실패/Chrome 인수를 추가하는 공식 AC 보정이 구현 전에 필요하다. / backend/index.js 및 backend/socket/socket.js::registerConnectionHandlers에서 연결할 실제 시스템 … |
| [PLAN-5.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-5.json>) | 2026-09-12 22:59:36 | codex | 후보 확장 요청 | 2.6 | 중간 탐색 | 확장 대상 10개: backend/controller/friend.controller.js, backend/services/achievementService.js, frontend/src/app/App.jsx |
| [PLAN-6.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-6.json>) | 2026-09-12 23:01:50 | codex | 본문 확인 요청 | 2.2 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-7.json>) | 2026-09-12 23:16:22 | codex | 후보 확장 요청 | 1.9 | 중간 탐색 | 확장 대상 10개: backend/controller/friend.controller.js, backend/services/achievementService.js, frontend/src/app/App.jsx |
| [PLAN-8.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-8.json>) | 2026-09-12 23:17:36 | codex | 후보 확장 요청 | 1.2 | 중간 탐색 | 확장 대상 10개: backend/service/friend.service.js, backend/repositories/friend.repositories.js, backend/socket/socket.js |
| [PLAN-9.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-9.json>) | 2026-09-12 23:19:40 | codex | 본문 확인 요청 | 2.1 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-10.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-10.json>) | 2026-09-12 23:31:25 | codex | 계획안 | 11.8 | 호출 실패 | 시간 초과 (600000ms) |
| [PLAN-11.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-11.json>) | 2026-09-12 23:34:36 | codex | 후보 확장 요청 | 2.0 | 중간 탐색 | 확장 대상 10개: backend/controller/friend.controller.js, backend/services/achievementService.js, backend/socket/socket.js |
| [PLAN-12.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-12.json>) | 2026-09-12 23:36:37 | codex | 후보 확장 요청 | 2.0 | 중간 탐색 | 확장 대상 10개: backend/service/friend.service.js, backend/repositories/friend.repositories.js, backend/index.js |
| [PLAN-13.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-13.json>) | 2026-09-12 23:38:25 | codex | 본문 확인 요청 | 1.8 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-14.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-14.json>) | 2026-09-12 23:44:54 | codex | 계획안 | 6.5 | 준비 미완료 | AC-01·AC-07: 신규 backend/service/notification.service.js를 호출할 실제 시스템 안내 production 생산자 파일·심볼, 발생 조건, 대상 계정 결정, 안정 원본 사건 키 및 열람/이동 대상을 확정해야 한다. backend/index.js와 기존 서버 경로를 조사했지만 해당 연결 근거를 확인하지 못했다. / AC-03·AC-07: backend/socket/socket.js와 신규 … |
| [PLAN-15.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-15.json>) | 2026-09-12 23:47:00 | codex | 후보 확장 요청 | 2.0 | 중간 탐색 | 확장 대상 10개: backend/controller/friend.controller.js, backend/services/achievementService.js, backend/socket/socket.js |
| [PLAN-16.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-16.json>) | 2026-09-12 23:48:56 | codex | 후보 확장 요청 | 1.9 | 중간 탐색 | 확장 대상 10개: backend/service/friend.service.js, backend/repositories/friend.repositories.js, frontend/src/domains/lobby/hooks/useFriendSocketEvents.js |
| [PLAN-17.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-17.json>) | 2026-09-12 23:50:15 | codex | 본문 확인 요청 | 1.3 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-18.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/PLAN-18.json>) | 2026-09-13 00:01:22 | codex | 계획안 | 11.1 | 준비 완료 | 성공조건 7개, 선택 코드 7개, 신규 항목 13개 |
| [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BB/runs/CLAUDE-PLAN-1.json>) | 2026-09-13 00:03:01 |  | 독립 계획 심사 | 1.7 | PASS | All selected entities, technical claims (restore-origin no-mark in sfxPlayer admit, non-transactional createFriendRequest, migration slot 0012, setting IDs, API client, model auto-loader), and absence of existing notification code were veri… |

## F18 (BC) — F-18 로비 프로필·Discord 고객센터·명예의 전당 진입 제거

| 기록·원문 | 기록 시각 KST | model 메타데이터 | 종류 | 시간(분) | 결과 | 핵심 내용 |
|---|---|---|---|---:|---|---|
| [PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/PLAN-1.json>) | 2026-09-13 11:09:00 | codex | 후보 확장 요청 | 1.1 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/lobby/pages/LobbyPage.jsx, frontend/src/domains/lobby/components/LobbyMenuNav.jsx, frontend/src/domains/lobby/hooks/useLobbyMenuNav.js |
| [PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/PLAN-2.json>) | 2026-09-13 11:10:02 | codex | 후보 확장 요청 | 1.0 | 중간 탐색 | 확장 대상 10개: frontend/src/app/routes/index.jsx, frontend/src/app/routes/__tests__/podiumRoute.test.js, frontend/src/domains/lobby/constants/__tests__/lobbyMenu.test.js |
| [PLAN-3.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/PLAN-3.json>) | 2026-09-13 11:11:14 | codex | 본문 확인 요청 | 1.2 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/PLAN-4.json>) | 2026-09-13 11:17:43 | codex | 계획안 | 6.5 | 준비 완료 | 성공조건 6개, 선택 코드 7개, 신규 항목 2개 |
| [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/CLAUDE-PLAN-1.json>) | 2026-09-13 11:19:36 |  | 독립 계획 심사 | 1.9 | REJECT | The plan's repository claims are accurate, but it leaves two existing test files unaddressed that directly assert the behavior AC-05 removes, guaranteeing frontend regression failures with no planned disposition. |
| [PLAN-5.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/PLAN-5.json>) | 2026-09-13 11:20:50 | codex | 후보 확장 요청 | 1.2 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/lobby/pages/LobbyPage.jsx, frontend/src/domains/lobby/components/LobbyMenuNav.jsx, frontend/src/domains/lobby/hooks/useLobbyMenuNav.js |
| [PLAN-6.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/PLAN-6.json>) | 2026-09-13 11:21:29 | codex | 본문 확인 요청 | 0.7 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/PLAN-7.json>) | 2026-09-13 11:28:28 | codex | 계획안 | 7.0 | 준비 완료 | 성공조건 6개, 선택 코드 8개, 신규 항목 2개 |
| [CLAUDE-PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BC/runs/CLAUDE-PLAN-2.json>) | 2026-09-13 11:30:16 |  | 독립 계획 심사 | 1.8 | PASS | Every repository claim in the plan (removal targets, kept menu button, resolver/env boundary, profile-edit save chain with expectedRevision, podium route and both locked test files' existing contracts, preservation and library ranking paths… |

## F19 (BD) — F-19 친구창 보완·차단/해제·대기방 친구 UI·실제 초대

| 기록·원문 | 기록 시각 KST | model 메타데이터 | 종류 | 시간(분) | 결과 | 핵심 내용 |
|---|---|---|---|---:|---|---|
| [PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-1.json>) | 2026-09-13 13:15:15 | codex | 후보 확장 요청 | 2.2 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/lobby/components/friendList/FriendListPanel.jsx, frontend/src/domains/lobby/hooks/useFriendListSync.js, frontend/src/domains/lobby/store/friend.store.js |
| [PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-2.json>) | 2026-09-13 13:16:40 | codex | 후보 확장 요청 | 1.4 | 중간 탐색 | 확장 대상 10개: backend/controller/friend.controller.js, backend/models/friend/FriendRequests.js, backend/service/notification.service.js |
| [PLAN-3.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-3.json>) | 2026-09-13 13:18:59 | codex | 본문 확인 요청 | 2.3 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-4.json>) | 2026-09-13 13:33:41 | codex | 후보 확장 요청 | 1.4 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/lobby/components/friendList/FriendListPanel.jsx, frontend/src/domains/game/matching/pages/GameMatchingPage.jsx, frontend/src/domains/lobby/hooks/useFriendListSync.js |
| [PLAN-5.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-5.json>) | 2026-09-13 13:35:55 | codex | 후보 확장 요청 | 2.2 | 중간 탐색 | 확장 대상 10개: backend/service/friend.service.js, backend/repositories/friend.repositories.js, backend/models/friend/FriendRequests.js |
| [PLAN-6.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-6.json>) | 2026-09-13 13:37:31 | codex | 본문 확인 요청 | 1.6 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-7.json>) | 2026-09-13 13:45:56 | codex | 구조화 응답 파싱 불가 | 8.4 | 판정 추출 불가 | 원본 ok=true이나 응답을 완전한 구조화 JSON으로 읽을 수 없다. 원문을 고치거나 준비 완료로 추정하지 않았다. |
| [PLAN-8.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-8.json>) | 2026-09-13 13:48:32 | codex | 후보 확장 요청 | 2.6 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/lobby/components/friendList/FriendListPanel.jsx, frontend/src/domains/lobby/components/friendList/accept/FriendAcceptTab.jsx, frontend/src/domains/lobby/hooks/useFriendListSync.js |
| [PLAN-9.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-9.json>) | 2026-09-13 13:50:53 | codex | 후보 확장 요청 | 2.3 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/matching/pages/GameMatchingPage.jsx, frontend/src/domains/lobby/hooks/useFriendSearch.js, frontend/src/domains/auth/store/auth.store.js |
| [PLAN-10.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-10.json>) | 2026-09-13 13:52:20 | codex | 본문 확인 요청 | 1.4 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-11.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-11.json>) | 2026-09-13 14:02:03 | codex | 계획안 | 9.7 | 준비 미완료 | backend/service/gameInvite.service.js(계획상 신규) ↔ backend/socket/matchmaking.js::handleJoinRoomByCode·handleStartGame·captureRoomStartProfiles·handleDeleteRoom·removeFromRoom·cleanupRoomStateForSessionParticipants ↔ backend/service/friend.ser… |
| [PLAN-12.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-12.json>) | 2026-09-13 14:05:04 | codex | 후보 확장 요청 | 3.0 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/lobby/components/friendList/FriendListPanel.jsx, frontend/src/domains/lobby/components/friendList/FriendListToggleButton.jsx, frontend/src/domains/lobby/components/friendList/accept/FriendAcceptTab.jsx |
| [PLAN-13.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-13.json>) | 2026-09-13 14:07:33 | codex | 후보 확장 요청 | 2.5 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/matching/pages/GameMatchingPage.jsx, frontend/src/domains/lobby/hooks/useFriendSocketEvents.js, backend/service/friend.service.js |
| [PLAN-14.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-14.json>) | 2026-09-13 14:08:50 | codex | 본문 확인 요청 | 1.3 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-15.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-15.json>) | 2026-09-13 14:17:07 | codex | 계획안 | 8.3 | 준비 미완료 | backend/service/gameInvite.service.js의 신규 수락 처리 ↔ backend/socket/matchmaking.js::handleJoinRoomByCode: DB 상태와 실제 Map 입장의 확정 시점, 실패·커밋 응답 유실·프로세스 재시작 복구 전략을 확정해야 한다. / backend/socket/matchmaking.js::handleStartGame·handleDeleteRoom·removeFro… |
| [PLAN-16.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-16.json>) | 2026-09-13 14:19:13 | codex | 후보 확장 요청 | 2.0 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/matching/pages/GameMatchingPage.jsx, frontend/src/domains/lobby/components/friendList/FriendListPanel.jsx, frontend/src/domains/lobby/components/friendList/FriendListToggleButton.jsx |
| [PLAN-17.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-17.json>) | 2026-09-13 14:21:25 | codex | 후보 확장 요청 | 2.2 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/matching/pages/GameMatchingPage.jsx, frontend/src/domains/lobby/store/friend.store.js, frontend/src/domains/lobby/hooks/useFriendSocketEvents.js |
| [PLAN-18.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-18.json>) | 2026-09-13 14:23:02 | codex | 본문 확인 요청 | 1.6 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-19.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-19.json>) | 2026-09-13 14:34:54 | codex | 계획안 | 11.9 | 준비 미완료 | backend/service/gameInvite.service.js의 신규 수락·결과 복구 경계와 backend/socket/matchmaking.js의 입장 조정 경계: DB commit 전후 실패·commit 응답 유실·세대 무효화·보상 실패·재시작별 DB 상태, 임시/최종 입장 기록, 실제 소속, ACK/재조회 결과를 확정한 상태표가 필요하다. 정상 수락 후 이탈·게임 시작의 역사적 수락과 공개 확정 전 중단도 구별해야 … |
| [PLAN-20.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-20.json>) | 2026-09-13 14:42:42 | codex | 후보 확장 요청 | 1.3 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/matching/pages/GameMatchingPage.jsx, frontend/src/domains/lobby/components/friendList/FriendListPanel.jsx, frontend/src/domains/lobby/hooks/useFriendListSync.js |
| [PLAN-21.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-21.json>) | 2026-09-13 14:44:27 | codex | 후보 확장 요청 | 1.7 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/matching/pages/GameMatchingPage.jsx, frontend/src/domains/lobby/pages/LobbyPage.jsx, frontend/src/domains/lobby/components/friendList/FriendListToggleButton.jsx |
| [PLAN-22.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-22.json>) | 2026-09-13 14:46:02 | codex | 본문 확인 요청 | 1.6 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-23.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/PLAN-23.json>) | 2026-09-13 14:58:23 | codex | 계획안 | 12.3 | 준비 완료 | 성공조건 7개, 선택 코드 19개, 신규 항목 9개 |
| [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BD/runs/CLAUDE-PLAN-1.json>) | 2026-09-13 15:00:23 |  | 독립 계획 심사 | 2.0 | PASS | All selected graph entities, claimed call paths, and repository facts were verified against the working tree at HEAD ae40d975; the nine new files are absent, every acceptance criterion is covered with concrete design and test contracts, and… |

## F20 (BE) — F-20 대기방 설정 변경

| 기록·원문 | 기록 시각 KST | model 메타데이터 | 종류 | 시간(분) | 결과 | 핵심 내용 |
|---|---|---|---|---:|---|---|
| [PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-1.json>) | 2026-09-17 14:19:25 | codex | 후보 확장 요청 | 2.4 | 중간 탐색 | 확장 대상 10개: backend/socket/matchmaking.js, backend/utils/createRoomValidation.js, backend/game-core/roleComposition.js |
| [PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-2.json>) | 2026-09-17 14:21:20 | codex | 후보 확장 요청 | 1.9 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/setup/components/GameSetupPanel.jsx, frontend/src/domains/game/setup/hooks/useGameSetupPage.js, frontend/src/domains/game/setup/utils/buildCreateRoomPayload.js |
| [PLAN-3.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-3.json>) | 2026-09-17 14:23:11 | codex | 본문 확인 요청 | 1.9 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-4.json>) | 2026-09-17 14:32:17 | codex | 계획안 | 9.1 | 준비 미완료 | AC-06: frontend/src/domains/game/ingame/components/controls/ingameSetting/SettingRoomTab.jsx의 keep-settings-next-game은 로컬 checks만 변경한다. frontend/src/domains/game/setup/pages/GameSetupPage.jsx → GameSetupPanel → useSetupTabState/useRoleCompo… |
| [PLAN-5.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-5.json>) | 2026-09-17 14:37:09 | codex | 후보 확장 요청 | 2.2 | 중간 탐색 | 확장 대상 10개: backend/socket/matchmaking.js, backend/utils/createRoomValidation.js, backend/game-core/roleComposition.js |
| [PLAN-6.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-6.json>) | 2026-09-17 14:38:43 | codex | 후보 확장 요청 | 1.6 | 중간 탐색 | 확장 대상 10개: backend/socket/socket.js, frontend/src/domains/game/setup/components/GameSetupPanel.jsx, frontend/src/domains/game/setup/hooks/useGameSetupPage.js |
| [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-7.json>) | 2026-09-17 14:40:33 | codex | 본문 확인 요청 | 1.8 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-8.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-8.json>) | 2026-09-17 14:49:43 | codex | 계획안 | 9.2 | 준비 완료 | 성공조건 6개, 선택 코드 17개, 신규 항목 7개 |
| [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/CLAUDE-PLAN-1.json>) | 2026-09-17 14:51:13 |  | 독립 계획 심사 | 1.5 | PASS | The plan's selected symbols, absent new-entity targets, and all load-bearing behavioral claims were verified against the current tree, every acceptance criterion has concrete modification and regression coverage, and the unsure entries are … |
| [PLAN-9.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-9.json>) | 2026-09-17 22:37:04 | codex | 후보 확장 요청 | 1.9 | 중간 탐색 | 확장 대상 10개: backend/socket/matchmaking.js, backend/utils/createRoomValidation.js, backend/game-core/roleComposition.js |
| [PLAN-10.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-10.json>) | 2026-09-17 22:38:43 | codex | 후보 확장 요청 | 1.7 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/matching/hooks/useMatchingRoom.js, frontend/src/domains/game/matching/hooks/useMatchingPage.js, frontend/src/domains/game/matching/pages/GameMatchingPage.jsx |
| [PLAN-11.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-11.json>) | 2026-09-17 22:39:53 | codex | 본문 확인 요청 | 1.2 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-12.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/PLAN-12.json>) | 2026-09-17 22:47:37 | codex | 계획안 | 7.7 | 준비 완료 | 성공조건 6개, 선택 코드 17개, 신규 항목 7개 |
| [CLAUDE-PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BE/runs/CLAUDE-PLAN-2.json>) | 2026-09-17 22:48:42 |  | 독립 계획 심사 | 1.1 | PASS | All selected symbols and claimed new entities were verified to exist in the current repository (root tree and BE candidate worktree a77d2a5d at the stated locations), the handleUpdateRoomSettings implementation matches the plan's AC-01/02/0… |

## F21 (BF) — F-21 방장 추방

| 기록·원문 | 기록 시각 KST | model 메타데이터 | 종류 | 시간(분) | 결과 | 핵심 내용 |
|---|---|---|---|---:|---|---|
| [PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-1.json>) | 2026-09-18 00:39:29 | codex | 후보 확장 요청 | 2.1 | 중간 탐색 | 확장 대상 10개: backend/socket/matchmaking.js, backend/socket/gameSession.js, backend/game-core/gameSession.js |
| [PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-2.json>) | 2026-09-18 00:41:50 | codex | 후보 확장 요청 | 2.4 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/ingame/components/controls/ingameSetting/kickPlayer/SettingKickPlayerModalContent.jsx, frontend/src/domains/game/ingame/hooks/useInGameSettingIsHost.js, frontend/src/domains/game/ingame/hooks/useGameSess… |
| [PLAN-3.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-3.json>) | 2026-09-18 00:43:44 | codex | 본문 확인 요청 | 1.9 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-4.json>) | 2026-09-18 00:49:53 | codex | 계획안 | 6.1 | 준비 미완료 | backend/socket/gameSession.js::handleLeaveGameSession와 backend/game-core/gameSession.js::endGameSessionForPlayer의 전체 종료 계약을 AC-03의 일반 이탈 동일성에 맞게 대체하는 상태표, 방장 이탈 권한 승계 및 backend/socket/__tests__/gameSession.test.js의 변경 단언을 확정해야 한다. / backend… |
| [PLAN-5.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-5.json>) | 2026-09-18 00:53:18 | codex | 후보 확장 요청 | 3.4 | 중간 탐색 | 확장 대상 10개: frontend/src/shared/ui/ProtectedRoute.jsx, frontend/src/domains/game/matching/hooks/useMatchingPage.js, frontend/src/domains/game/matching/pages/GameMatchingPage.jsx |
| [PLAN-6.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-6.json>) | 2026-09-18 00:55:15 | codex | 본문 확인 요청 | 2.0 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-7.json>) | 2026-09-18 01:04:28 | codex | 계획안 | 9.2 | 준비 미완료 | AC-03·AC-05: backend/game-core/gameSession.js::prepareDayVoteResolution·commitTribunalVoteResolution에서 추방된 표적의 기존 낮 표와 재판 피고 이탈을 처리할 상태 전이, backend/socket/gameSession.js의 방송·타이머, frontend/src/domains/game/ingame/store/applyTribunalResolved.… |
| [PLAN-8.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-8.json>) | 2026-09-18 01:15:46 | codex | 후보 확장 요청 | 2.1 | 중간 탐색 | 확장 대상 10개: backend/socket/matchmaking.js, backend/socket/gameSession.js, backend/game-core/gameSession.js |
| [PLAN-9.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-9.json>) | 2026-09-18 01:18:32 | codex | 후보 확장 요청 | 2.8 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/ingame/components/controls/ingameSetting/kickPlayer/SettingKickPlayerModalContent.jsx, frontend/src/domains/game/matching/hooks/useMatchingRoom.js, frontend/src/domains/game/matching/hooks/useMatchingPag… |
| [PLAN-10.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-10.json>) | 2026-09-18 01:20:02 | codex | 본문 확인 요청 | 1.5 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-11.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/PLAN-11.json>) | 2026-09-18 01:32:27 | codex | 계획안 | 12.4 | 준비 완료 | 성공조건 6개, 선택 코드 20개, 신규 항목 12개 |
| [CLAUDE-PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BF/runs/CLAUDE-PLAN-1.json>) | 2026-09-18 01:34:23 |  | 독립 계획 심사 | 1.9 | PASS | All selected entities, claimed behaviors (including commitDayVoteResolution at line 2351, missing hostUuid in session candidate/snapshot, forced alive=true in setGamePayload, and leave's idempotent success ACK), referenced test harnesses, a… |

## F22 (BG) — F-22 강제 종료·종료 정리

| 기록·원문 | 기록 시각 KST | model 메타데이터 | 종류 | 시간(분) | 결과 | 핵심 내용 |
|---|---|---|---|---:|---|---|
| [PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/monitor/F22-cancelled-20260918/slice/runs/PLAN-1.json>) | 2026-09-18 18:26:01 | codex | 후보 확장 요청 | 2.2 | 중간 탐색 | 확장 대상 10개: backend/game-core/gameSession.js, backend/socket/gameSession.js, backend/socket/matchmaking.js |
| [PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/monitor/F22-cancelled-20260918/slice/runs/PLAN-2.json>) | 2026-09-18 18:28:31 | codex | 후보 확장 요청 | 2.5 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/ingame/components/controls/ingameSetting/SettingRoomTab.jsx, frontend/src/domains/game/ingame/components/controls/ingameSetting/SettingPanelContent.jsx, frontend/src/domains/game/ingame/hooks/useGameSess… |
| [PLAN-3.json](<C:/Users/minsa/jokertest/.pluto/monitor/F22-cancelled-20260918/slice/runs/PLAN-3.json>) | 2026-09-18 18:30:02 | codex | 본문 확인 요청 | 1.5 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/monitor/F22-cancelled-20260918/slice/runs/PLAN-4.json>) | 2026-09-18 18:36:51 | codex | 계획안 | 6.8 | 준비 미완료 | AC-02·AC-05: backend/socket/gameSession.js::handleGetSessionSnapshot 및 resyncSessionRouting과 frontend/src/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js::useInGameSessionSnapshotSync에는 삭제된 세션의 종료 사유를 복원하는 연결이 없다. game_ended 유실·연결… |
| [PLAN-5.json](<C:/Users/minsa/jokertest/.pluto/monitor/F22-cancelled-20260918/slice/runs/PLAN-5.json>) | 2026-09-18 18:38:54 | codex | 후보 확장 요청 | 2.0 | 중간 탐색 | 확장 대상 10개: backend/game-core/gameSession.js, backend/repositories/gameResult.repositories.js, backend/socket/matchmaking.js |
| [PLAN-6.json](<C:/Users/minsa/jokertest/.pluto/monitor/F22-cancelled-20260918/slice/runs/PLAN-6.json>) | 2026-09-18 18:40:20 | codex | 본문 확인 요청 | 1.4 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/monitor/F22-cancelled-20260918/slice/runs/PLAN-7.json>) | 2026-09-18 18:48:48 | codex | 계획안 | 8.5 | 준비 미완료 | AC-02·AC-05: backend/socket/gameSession.js::persistTerminalSession·attemptTerminalPersist는 메모리의 불변 레코드를 비동기 저장한다. 동기 강제 종료 확정 후 DB 커밋 전 재시작에서도 참가자 종료 사실을 보존할 저장 경계와 시작 시 복구 소비처를 확정해야 한다. 신규 handleGetForceEndNotices·handleAcknowledgeForceEnd… |

## F23 (BH) — F-23 관전자 설정·입장·권한 전면 제거

| 기록·원문 | 기록 시각 KST | model 메타데이터 | 종류 | 시간(분) | 결과 | 핵심 내용 |
|---|---|---|---|---:|---|---|
| [PLAN-1.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-1.json>) | 2026-09-18 19:12:29 | codex | 후보 확장 요청 | 1.5 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js, frontend/src/domains/game/ingame/components/controls/ingameSetting/SettingRoomTab.jsx, frontend/src/domains/game/setup/utils/roomSettingsForm… |
| [PLAN-2.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-2.json>) | 2026-09-18 19:14:34 | codex | 후보 확장 요청 | 2.1 | 중간 탐색 | 확장 대상 10개: backend/utils/updateRoomSettingsValidation.js, backend/socket/__tests__/matchmaking.settings.test.js, frontend/src/domains/game/ingame/pages/InGamePage.jsx |
| [PLAN-3.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-3.json>) | 2026-09-18 19:16:22 | codex | 본문 확인 요청 | 1.8 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-4.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-4.json>) | 2026-09-18 19:24:50 | codex | 계획안 | 8.5 | 준비 미완료 | AC-01·AC-03: SettingRoomTab.jsx::handleRoomAction/keep-settings-next-game에서 실제 다음 방 설정 생산·저장·읽기·GameSetupPage 초기값까지의 연결이 없다. F-24·F-28 담당 승인과 현재 성공 조건의 완료 경계를 공식 계약에 연결하고 실제 복원 파일·심볼·시험을 확정해야 한다. / AC-05: backend/socket/gameSession.js::hand… |
| [PLAN-5.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-5.json>) | 2026-09-18 19:27:21 | codex | 후보 확장 요청 | 2.5 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js, frontend/src/domains/game/setup/utils/roomSettingsForm.js, frontend/src/domains/game/matching/hooks/__tests__/roomSettings.integration.test.j… |
| [PLAN-6.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-6.json>) | 2026-09-18 19:29:43 | codex | 후보 확장 요청 | 2.4 | 중간 탐색 | 확장 대상 10개: backend/game-core/gameSession.js, backend/socket/__tests__/gameSession.test.js, backend/socket/__tests__/matchmaking.gameInvite.test.js |
| [PLAN-7.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-7.json>) | 2026-09-18 19:31:16 | codex | 본문 확인 요청 | 1.5 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-8.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-8.json>) | 2026-09-18 19:39:32 | codex | 계획안 | 8.3 | 준비 미완료 | 잠금 기준본 F0361·F0364·F0315·F0305·F0331·X0143의 공식 파일·심볼 및 현재 후보 ID 대응이 없어 기존 선택·제외 계약을 기계적으로 확정할 수 없다. / AC-01·AC-03: SettingRoomTab.jsx::handleRoomAction/keep-settings-next-game→실제 다음 방 설정 생산·저장·복원→GameSetupPage.jsx::GameSetupPage 초기값 연결이 없으며… |
| [PLAN-9.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-9.json>) | 2026-09-18 19:42:27 | codex | 후보 확장 요청 | 2.9 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js, frontend/src/domains/game/setup/utils/roomSettingsForm.js, backend/utils/updateRoomSettingsValidation.js |
| [PLAN-10.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-10.json>) | 2026-09-18 19:42:50 | codex | 기타/응답 없음 | 0.4 | 호출 실패 | codex가 1로 끝났다: 2026-09-18T10:42:28.728305Z  WARN codex_skills::interface: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/ 2026-09-18T10:42:28.728374Z  WARN codex_skills::interfac |
| [PLAN-11.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-11.json>) | 2026-09-18 19:48:01 | codex | 후보 확장 요청 | 3.5 | 중간 탐색 | 확장 대상 10개: frontend/src/domains/game/ingame/constants/controls/ingameSetting/ingameSettingData.js, frontend/src/domains/game/setup/utils/roomSettingsForm.js, backend/utils/updateRoomSettingsValidation.js |
| [PLAN-12.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-12.json>) | 2026-09-18 19:49:21 | codex | 본문 확인 요청 | 1.3 | 중간 탐색 | 본문 확인 대상 6개 |
| [PLAN-13.json](<C:/Users/minsa/jokertest/.pluto/slices/BH/runs/PLAN-13.json>) | 2026-09-18 19:57:40 | codex | 계획안 | 8.3 | 준비 미완료 | AC-01·AC-03: SettingRoomTab.jsx::SettingRoomTab/handleRoomAction에서 GameSetupPage.jsx::GameSetupPage까지 실제 다음 방 설정 생산·저장·복원 연결이 없으며 현재 F23 AC와 F24 RESTORE-24·F28 RESTORE-INTEGRATION-28의 공식 완료 대응이 미확정이다. / AC-04: matchmaking.js::handleAcceptGa… |
