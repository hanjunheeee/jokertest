# 문제 목록 — 인게임 C (채팅·죽은 사람·연결·화면 도구)

2단계 브라우저 시험(desktop 1280×800, `e2e/tests/ingame/c-chat/`)에서 나온 문제. 앱 코드는 안 고침, 3단계에서 감독이 모아서 고침.
시험 도우미(`e2e/helpers/`)·환경 문제는 아래 "시험 바탕 문제"에 따로.

| 번호 | 시험 이름 | 재현 순서 | 기대 | 실제 | 의심 파일:줄 | 심각도 |
|---|---|---|---|---|---|---|
| 1 | chat-closeup › 죽은 뒤 클로즈업을 열면 → 클로즈업에도 "죽은 사람끼리" 표시가 보임 | 처형되어 죽음 → 관전 계속하기 → 채팅 크게 보기 열기 | 크게 보기 창 채팅 칸 위에도 "죽은 사람끼리" 표시 (보드 채팅·재판 채팅엔 있음) | 크게 보기 창엔 표시가 없음 → 죽은 사람이 크게 보기에서 누구에게 말하는지 모름 | frontend/src/domains/game/ingame/components/chat/InGameChatCloseupOverlay.jsx (props에 `isDeadChat` 없음, `<InGameChatContent variant="closeup">`에 안 넘김) | 낮음 |
| 2 | reconnect › 오프라인 중 보낸 글이 시간 초과 오류가 났으면 → 다시 연결돼도 다른 사람에게 안 감 | 낮 채팅 칸에 글 → 오프라인(context.setOffline) 상태에서 Enter → 5초 뒤 "요청이 응답하지 않습니다" 오류·글은 입력칸에 남음 → 온라인 | 오류를 보인 글은 안 간 것 (또는 늦게 가면 오류를 지우고 입력칸 비움) | 소켓이 끊긴 게 아니라 글이 버퍼에 있다가 다시 연결되면 서버에 가서 다른 사람에게 보임, 화면엔 오류·글이 그대로 → 사람이 다시 보내면 같은 말이 두 번 감 | frontend/src/domains/game/ingame/hooks/useInGameGameChatSession.js (보내기 5초 시간 초과 뒤 늦은 응답은 `isStale`/세대로 버림, 보낸 글 자체는 안 거둠) · useInGameJokerChatSession.js 같은 모양 | 낮음 |
| 3 | night-role-chat › 시민 둘(나·p2)이면 → 밤에 내가 쓴 글이 p2에게 보임 (깜빡임, 1/2번 실패) | 시민 둘 판 → 밤이 되자마자(내 화면만 밤으로 바뀐 직후) 밤 채팅 보내기 | 같은 직업 p2 화면에 보임 | 한 번은 p2 채팅 내역이 비어 있음 (혼자 다시 돌리면 통과) — 의심: p2 화면이 아직 밤으로 안 바뀐 사이 온 `joker_chat_message`는 받기 손잡이가 안 붙어 버려짐 (밤 같은 직업 채팅 받기는 `canReadRoleNightChat(gameState)`일 때만 붙임). 시험은 두 화면이 밤 글을 보일 때까지 기다리게 고침 | frontend/src/domains/game/ingame/hooks/useInGameJokerChatSession.js:62-74 | 낮음 (밤 시작 직후 첫 말이 느린 화면에서 빠질 수 있음) |
| 4 | (관찰) reconnect › 새로고침 계열 | 판 중 새로고침 | — | 새로고침하면 그 판 채팅 기록이 다 사라짐(스냅샷에 채팅 없음), 역할 공개 창이 다시 뜸. 시험은 이것을 기대값으로 두지 않음 | backend/game-core/snapshot/* (채팅 없음) | 확인 필요 (설계 결정) |

## 시험 바탕 문제 (앱 아님, 도우미·환경)

| 번호 | 무엇 | 재현 | 영향 | 의심 파일:줄 | 심각도 |
|---|---|---|---|---|---|
| E1 | 실행 시작 정리(global-setup)가 **모든** e2e 계정(`e2e+%@example.test`)과 메일 폴더를 지움 | 에이전트 A가 시험 도는 중 에이전트 B가 `npx playwright test` 시작 | A의 계정이 지워져 A 시험이 중간에 깨짐 (여럿이 한 DB를 쓰는 2단계에서 서로 지움) — C 파트는 시작 정리를 뺀 따로 설정(scratchpad `pw.config.js`, globalSetup 없음)으로 돌림 | e2e/helpers/global-setup.js:11 (`ALL_E2E_EMAIL_LIKE`) | 높음 (병렬 실행 때) |
| E2 | `accounts.createMany`/`table.setup`의 계정 동시 만들기가 가끔 DB 교착 | 판 시험 여럿 동시 (봇 계정 Promise.all) | `SequelizeDatabaseError: Deadlock found` 로 시험 시작 전에 실패 (깜빡임, 혼자 다시 돌리면 통과) | e2e/helpers/accounts.js:88 (`createAccounts` = Promise.all) · backend 가입 트랜잭션 | 중간 (깜빡임) |
| E3 | `db.query`에 JS `Date`를 넣으면 9시간 어긋나게 저장 | `INSERT INTO user_bans (... start_at) VALUES (?)`에 `new Date()` | 정지 시작이 9시간 뒤로 들어가 정지가 안 걸림 — C 파트는 `DATE_ADD(NOW(), INTERVAL ? SECOND)`로 씀 | e2e/helpers/db.js:38 (raw query replacements 날짜를 PC 시간대로 씀) | 낮음 (시험 작성 주의) |

## 실행 상태 (2026-11-09, 감독 요청으로 중간에 실행 멈춤 — 나머지는 3단계에서 감독이 돌림)

- 돌려서 확인: dead-chat 14/14 통과, night-role-chat 첫 36개 중 33 통과(실패 3 = 위 3번 깜빡임 1 + E2 교착 2, 혼자 다시 돌리면 3개 다 통과), admin-disconnect·leave-game·reconnect·session-replaced 전부 통과(위 2번 앱 문제 1개만 실패), dead-joker-tribunal 앞 6개 통과
- 써 두기만(안 돌림): overlay-chat-lock, dead-together, dead-joker-tribunal 나머지, emoji, card-menu, settings-sheet, chat-closeup, vote-status, records-report, server-shutdown(@shutdown, serial 전용)
- 1번(크게 보기 죽은 사람 표시)은 코드 읽기로 찾음 — 시험(chat-closeup)은 아직 안 돌림
