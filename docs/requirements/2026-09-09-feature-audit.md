# Joker 기능 요구사항 조사 근거

기준: 2026-09-09, `C:/Users/minsa/jokertest`, `bab2793`. 이 문서는 사실 확인 기록이며 구현 승인서가 아니다.

**후속 적용:** 아래 ‘조사 방법과 한계’는 최초 요구사항 조사 시점 기록이다. 이후 사용자 지시 ‘무음 처리 및 기록까지’로 로그인·로비의 음악 재생 차단을 실제 구현했다. 프론트 테스트 1,164개·빌드 통과 및 영상 6곳 muted를 확인했다. [별도 적용 기록](C:/Users/minsa/jokertest/docs/qa/2026-09-09-music-mute.md)을 참조한다. 현재 파일 재검색으로 LoginMusic.wav가 로그인·로비 양쪽에서 사용되던 사실도 확인하여 두 경로 모두 차단했다.

## 조사 방법과 한계

- codebase-memory의 기존 프로젝트 인덱스를 확인하고, 최신 UI 누락을 발견하여 fast 재색인했다. 결과: 4,764 nodes / 7,661 edges. 파일·함수·라우트 검색과 밤 판정 함수 원문 조회를 사용했다.
- 그래프 출력 일부의 한글 깨짐·이전 위치 정보는 현재 파일 직접 읽기로 재확인했다. 아래 판단은 주석만이 아니라 핸들러·상태 소비·API 경로를 대조한 결과다.
- MySQL은 backend의 기존 연결설정을 사용하여 `information_schema.COLUMNS`만 읽었다. 개인 계정 행이나 비밀값은 문서에 수집하지 않았다. 확인된 애플리케이션 테이블은 14개이다.
- public 자산 파일을 열거하여 영상 및 알림/이모티콘 이름 후보를 확인했다. 밤 역할 성공 영상은 전용 파일명이 없고 해당 플레이어 코드도 연결돼 있지 않다. 별도 외부 저장소의 존재까지 부정하는 것은 아니다.
- 이전 QA 결과는 참고 자료로만 읽었다. 이번에는 서버 재기동·브라우저 조작·게임 진행·테스트 실행을 하지 않았다.
- 앱 소스·DB·Pluto 상태는 변경하지 않았다. 이번 산출물은 `docs/requirements/`의 문서/계획뿐이다.

음악 추가 조사: public 하위의 mp3/wav/ogg/m4a/aac/flac/mid/midi 파일을 확인한 결과 [LoginMusic.wav](C:/Users/minsa/jokertest/frontend/public/bgm/LoginMusic.wav) 1개만 존재한다. [bgmAssets.js](C:/Users/minsa/jokertest/frontend/src/shared/constants/bgmAssets.js)는 loginMusic 하나만 정의하고 [useLobbyIntro.js](C:/Users/minsa/jokertest/frontend/src/domains/lobby/hooks/useLobbyIntro.js)·[LobbyBackground.jsx](C:/Users/minsa/jokertest/frontend/src/domains/lobby/components/LobbyBackground.jsx)가 소비한다. 파일의 출처/라이선스와 기존 영상에 내장된 오디오 트랙은 아직 검증하지 않았다. 현재 사용 가능한 도구 목록에서 전용 음악 생성 도구는 발견되지 않아, 직접 작성한 악곡과 음색 합성/렌더링을 기본 제작 경로로 제안했다. 이 조사에서 신규 음원을 실제 제작한 것은 아니다.

## 요구사항별 근거

음악 최신 지시 반영: 사용자는 ‘법적위험이 1이라도 있다면 그냥 하지말라’고 지정했다. 절대적 무위험을 보장할 수 없어 직접 작곡/합성을 포함한 신규 음악 제작은 보류했고, F-16A·F-16B를 실행 배치 제외 대상으로 표시했다. 대체 음원을 만드는 우회는 허용하지 않는다. 앞선 음악 제작 설명은 이전 제안의 조사 기록이다. 앱 코드나 현재 음원 파일을 이번 문서 수정으로 바꾸지는 않았다.

| 요구사항 | 확인된 사실 | 근거 파일 |
|---|---|---|
| AUTH-01 | Google·Discord 이미지 버튼에 인증 핸들러 없음 | [SocialLoginButtons.jsx](C:/Users/minsa/jokertest/frontend/src/domains/auth/components/LoginForm/SocialLoginButtons.jsx) |
| AUTH-01 | users의 email·password_hash NOT NULL. 소셜 identity 모델 없음 | [user.model.js](C:/Users/minsa/jokertest/backend/models/user/user.model.js) 및 실제 DB |
| AUTH-02 | rememberMe를 로그인 API로 전달 | [useLoginPage.js](C:/Users/minsa/jokertest/frontend/src/domains/auth/hooks/useLoginPage.js) |
| AUTH-02 | true일 때만 30일 maxAge, JWT는 항상 1d | [cookieOptions.js](C:/Users/minsa/jokertest/backend/auth/cookieOptions.js), [jwt.js](C:/Users/minsa/jokertest/backend/utils/jwt.js) |
| AUTH-03 | 가입 입력은 email/password/nickname 3개 | [SignupFields.jsx](C:/Users/minsa/jokertest/frontend/src/domains/auth/components/SignupForm/SignupFields.jsx) |
| AUTH-03 | 가입 시 이메일/닉네임 선조회, 생성 트랜잭션과 unique 충돌 409 처리 존재 | [auth.service.js](C:/Users/minsa/jokertest/backend/service/auth.service.js), [user.repositories.js](C:/Users/minsa/jokertest/backend/repositories/user.repositories.js) |
| AUTH-03 | 생년월일·전화는 모델과 DB에 존재하지만 가입 서비스가 저장하지 않음 | [user.model.js](C:/Users/minsa/jokertest/backend/models/user/user.model.js), [auth.service.js](C:/Users/minsa/jokertest/backend/service/auth.service.js) |
| AUTH-04 | 프로필 GET, 닉네임 PATCH, 비밀번호 PATCH 구현. 현재 비밀번호 대조·해시 저장 존재 | [user.routes.js](C:/Users/minsa/jokertest/backend/routes/user.routes.js), [profile.controller.js](C:/Users/minsa/jokertest/backend/controller/profile.controller.js) |
| AUTH-04 | 닉네임 변경 후 auth/profile cache 갱신. 비밀번호 변경 요청 연결 | [useNicknameForm.js](C:/Users/minsa/jokertest/frontend/src/domains/user/hooks/useNicknameForm.js), [usePasswordForm.js](C:/Users/minsa/jokertest/frontend/src/domains/user/hooks/usePasswordForm.js) |
| SET-01 | 알림 옵션에 귓속말 포함, 일반/사운드 두 탭 | [generalSettings.js](C:/Users/minsa/jokertest/frontend/src/domains/settings/constants/generalSettings.js), [settingTabs.js](C:/Users/minsa/jokertest/frontend/src/domains/settings/constants/settingTabs.js) |
| SET-01 | 알림/텍스트 크기는 지역 state. 초기화 액션은 분기 없음. 전체화면·도움말은 연결 | [GeneralSettingsTab.jsx](C:/Users/minsa/jokertest/frontend/src/domains/settings/components/tabs/GeneralSettingsTab.jsx) |
| SET-01 | 사운드 store는 두 설정 화면 간 공유하나 refresh 비영속. 실제 audio hook은 별도 volume 0.6/muted state 사용 | [settingsStore.js](C:/Users/minsa/jokertest/frontend/src/domains/settings/store/settingsStore.js), [useAudioControl.js](C:/Users/minsa/jokertest/frontend/src/shared/hooks/useAudioControl.js) |
| SET-02 | 기존 친구 요청 API는 존재. 통합 알림 API/테이블 및 게임 초대 수명주기 핸들러는 확인되지 않음 | [friend.routes.js](C:/Users/minsa/jokertest/backend/routes/friend.routes.js), [matchmaking.js](C:/Users/minsa/jokertest/backend/socket/matchmaking.js) |
| UI-01 | customerSupport 메뉴에 Discord 이미지가 있지만 라우트 매핑·특별 처리 없음. 사용자 확정: 메뉴 목록 아래 이 Discord 버튼을 유지하여 고객센터 역할로 연결 | [LobbyMenuNav.jsx](C:/Users/minsa/jokertest/frontend/src/domains/lobby/components/LobbyMenuNav.jsx), [lobbyMenu.js](C:/Users/minsa/jokertest/frontend/src/domains/lobby/constants/lobbyMenu.js), [useLobbyMenuNav.js](C:/Users/minsa/jokertest/frontend/src/domains/lobby/hooks/useLobbyMenuNav.js) |
| UI-01 | 독립 Discord 버튼의 기본 onClick은 빈 함수. 현재 오른쪽 하단에 배치. 사용자 확정: 오른쪽의 큰 버튼이 삭제 대상 | [LobbyDiscordButton.jsx](C:/Users/minsa/jokertest/frontend/src/domains/lobby/components/LobbyDiscordButton.jsx), [LobbyPage.jsx](C:/Users/minsa/jokertest/frontend/src/domains/lobby/pages/LobbyPage.jsx) |
| UI-01 | 로비 배너 톱니는 onAccount→/account, 프로필 편집 직접 연결 없음 | [LobbyProfileArea.jsx](C:/Users/minsa/jokertest/frontend/src/domains/lobby/components/LobbyProfileArea.jsx), [LobbyPage.jsx](C:/Users/minsa/jokertest/frontend/src/domains/lobby/pages/LobbyPage.jsx) |
| ECO-01 | 상점 잔액 free 12,450 / premium 320 고정 | [storeCurrencyPreview.js](C:/Users/minsa/jokertest/frontend/src/domains/store/constants/storeCurrencyPreview.js) |
| SHOP-01 | 4카테고리. 스킨 9, 카드 8, 테두리 6, 재화팩 8. 가격 재화 타입 없음, 재화팩 준비중 | [storeFilterOptions.js](C:/Users/minsa/jokertest/frontend/src/domains/store/constants/storeFilterOptions.js), [storeItems.js](C:/Users/minsa/jokertest/frontend/src/domains/store/constants/storeItems.js) |
| SHOP-01 | 단건 클릭은 구매하지 않음. bulk confirm은 TODO 후 모달만 닫음 | [StorePanel.jsx](C:/Users/minsa/jokertest/frontend/src/domains/store/components/panel/StorePanel.jsx) |
| STAT-01 | 경기/참가자/통계 저장을 트랜잭션 처리, game_id 기준 중복 방지. most_played_role 계산 | [gameResult.repositories.js](C:/Users/minsa/jokertest/backend/repositories/gameResult.repositories.js) |
| STAT-01 | 참가자 role/team/won/is_alive 존재, 중단 경기는 won nullable. 투표 횟수 컬럼 없음 | [game_result_player.model.js](C:/Users/minsa/jokertest/backend/models/game/game_result_player.model.js) 및 실제 DB |
| STAT-01 | 내 전적·숙련도 랭킹 더미. 서버는 CITIZEN, UI는 noble | [invitedGuestsDevState.js](C:/Users/minsa/jokertest/frontend/src/domains/library/content/invitedGuests/invitedGuestsDevState.js), [roleComposition.js](C:/Users/minsa/jokertest/backend/game-core/roleComposition.js) |
| ACH-01 | 기록 조건 7개·진행률·공통 더미 보상 정의 | [spreadMeta.js](C:/Users/minsa/jokertest/frontend/src/domains/library/content/forbiddenRecords/spreadMeta.js) |
| ACH-01 | 해금 여부는 개발 상수 false | [forbiddenRecordsChallengeDevState.js](C:/Users/minsa/jokertest/frontend/src/domains/library/content/forbiddenRecords/forbiddenRecordsChallengeDevState.js) |
| ACH-02 | 5직업 × 10/20/30승. 마지막 보상은 직업 테두리 | [jobChallenges.js](C:/Users/minsa/jokertest/frontend/src/domains/library/content/invitedGuests/jobChallenges.js) |
| MY-01 | 운명의 가면 문구가 most_played_role 기준 | [useMyProfile.js](C:/Users/minsa/jokertest/frontend/src/domains/user/hooks/useMyProfile.js) |
| MY-02 | 기본 프로필 16종·평민 테두리 1종 고정 목록 | [profileEditLayout.js](C:/Users/minsa/jokertest/frontend/src/domains/user/constants/profileEditLayout.js) |
| MY-02 | 프로필·테두리·스킨·카드 장착은 전역 메모리만 | [profileCustomization.store.js](C:/Users/minsa/jokertest/frontend/src/domains/user/store/profileCustomization.store.js), [skinCardWear.store.js](C:/Users/minsa/jokertest/frontend/src/domains/user/store/skinCardWear.store.js) |
| ROOM-01 | 생성·조회·입장·준비·시작·삭제 핸들러만 있고 설정 update 없음 | [matchmaking.js](C:/Users/minsa/jokertest/backend/socket/matchmaking.js) |
| ROOM-01 | 설정 항목 및 입력 검증 존재. lightsOut/soulBetting/voteReveal은 저장 이후 엔진 적용 확인 안 됨 | [gameSetupOptions.js](C:/Users/minsa/jokertest/frontend/src/domains/game/setup/constants/gameSetupOptions.js), [createRoomValidation.js](C:/Users/minsa/jokertest/backend/utils/createRoomValidation.js) |
| GAME-01 | 채팅 크기·시간·닉네임 색상은 탭 내부 state | [SettingChatTab.jsx](C:/Users/minsa/jokertest/frontend/src/domains/game/ingame/components/controls/ingameSetting/SettingChatTab.jsx) |
| GAME-02 | 추방은 목록의 선택 토글뿐. 방 코드·강제 종료 액션 연결 없음. 관전자·유지 설정 지역 state | [SettingKickPlayerModalContent.jsx](C:/Users/minsa/jokertest/frontend/src/domains/game/ingame/components/controls/ingameSetting/kickPlayer/SettingKickPlayerModalContent.jsx), [SettingRoomTab.jsx](C:/Users/minsa/jokertest/frontend/src/domains/game/ingame/components/controls/ingameSetting/SettingRoomTab.jsx) |
| NIGHT-01 | 밤 역할은 JOKER 암살/DOCTOR 보호/GUARD 조사/WITCH_HUNTER 사망자 확인. 의사 개인 결과 없음 | [prepareNightResolution](C:/Users/minsa/jokertest/backend/game-core/gameSession.js:1449) |
| NIGHT-02 | commit→낮 타이머 시작→개인 결과→night_result_applied. 영상 완료를 기다리지 않음 | [handleResolveNight](C:/Users/minsa/jokertest/backend/socket/gameSession.js:1451) |
| NIGHT-02 | night_result_applied와 tribunal_vote_resolved로 킬 큐 생성. 개인 결과는 텍스트 | [useInGameKillReveal.js](C:/Users/minsa/jokertest/frontend/src/domains/game/ingame/hooks/useInGameKillReveal.js), [reduceInGameNightPrivateResult.js](C:/Users/minsa/jokertest/frontend/src/domains/game/ingame/utils/reduceInGameNightPrivateResult.js) |
| NIGHT-02 | public의 kill-animation.mp4를 사용. 경비/의사/마녀사냥꾼 성공 영상 연결 없음 | [ingameKillReveal.js](C:/Users/minsa/jokertest/frontend/src/domains/game/ingame/constants/killReveal/ingameKillReveal.js), public 파일 열거 |

## 실제 DB 확인 결과

현재 14개 테이블: `users`, `user_sessions`, `user_stats`, `user_bans`, `login_history`, `online_presence`, `friend_requests`, `friendships`, `account_find_requests`, `password_reset_tokens`, `traffic_logs`, `game_results`, `game_result_players`, `concurrent_snapshots`.

| 핵심 항목 | 실제 DB |
|---|---|
| users.nickname | varchar(50), NOT NULL, UNIQUE |
| users.email | varchar(100), NOT NULL, UNIQUE |
| users.password_hash | varchar(255), NOT NULL |
| users.phone | varchar(20), NULL 허용 |
| users.birth_date | datetime, NULL 허용 |
| users.profile_image_url | text, NULL 허용 |
| game_result_players.nickname_snapshot | varchar(30), NOT NULL |
| game_result_players 기본키 | game_id + user_id |
| game_result_players.won | nullable boolean |
| user_stats | reputation/title/total_games/survival_count/execution_count/most_played_role |

지갑·원장·상품·소유품·장착·소셜 identity·업적·보상 지급·알림 전용 테이블은 현재 목록에 없다. 기본 이미지 경로 하나만으로 테두리와 아이템 소유권까지 저장할 수 없다.

기존 `docs/schema-known-issues.md`는 DB3 시점의 기록이다. 그 문서의 ‘경기 결과 모델만 있고 저장 경로 없음’은 현재와 다르며, 지금은 `persistGameResult`가 존재한다. 이번 요구사항은 현재 구현을 기준으로 잡았다.

## Pluto와 검증 환경

- CLI: `C:/dev/pluto/packages/daemon/dist/src/cli.js`.
- `status C:/Users/minsa/jokertest` 결과: `stopped`. `.pluto/daemon.json`의 오래된 PID만으로 실행 중이라고 판정하지 않았다.
- [autopilot-batch.md](C:/dev/pluto/docs/autopilot-batch.md): Markdown `##` 또는 JSON name/requirement 배열을 작은 작업으로 해석하고 순차 실행한다.
- 실제 [batch.ts](C:/dev/pluto/packages/daemon/src/batch.ts) 파서는 `#` 아래 가장 가까운 하위 제목을 작업 경계로 선택한다. 공통 머리말은 작업 본문에 포함되지 않는다.
- 실제 [cli.ts](C:/dev/pluto/packages/daemon/src/cli.ts)의 batch는 연결 실패 시 daemon을 시작하고 `pluto/slices/batch`를 호출한다. 읽기 전용 준비 명령이 아니다.
- 이전 UI 배치는 V~AK의 RESULT가 모두 done이다. 별도 L `joker-DB3-tables-cleanup`은 IMPL/R-IMPL, U `joker-QA5-auth-entry-usability`는 PLAN으로 남아 있다. 상태 완료 처리나 삭제는 하지 않았다.
- [.pluto/config.json](C:/Users/minsa/jokertest/.pluto/config.json)은 `npm ci --prefix frontend`, `npm ci --prefix backend`, frontend test/build, backend game-core test를 검증 명령으로 사용한다. backend 전체 test는 포함되지 않았다.
- 이번 JSON 초안은 실행용 `requirements`가 아닌 검토용 `slices` 필드다. 승인이 완료되면 각 슬라이스의 공통 규칙과 확정 정책을 펼쳐 실행용 JSON으로 변환한다.

## 기존 QA에서 발견됐던 연관 결함

[2026-09-09 QA 결과](C:/Users/minsa/jokertest/docs/qa/ui-16-browser-regression/RESULTS-2026-09-09.md)에 공개방 입장 버튼 가림, 결과 로스터/MVP 비어 있음, 결과에서 로비 이동 미확인, 설정 화면 재촬영 필요가 기록되어 있다.

이 결함들은 이번 조사에서 새로 재현한 결과가 아니다. 새 요구사항 구현 중 필수 연동을 가로막으면 해당 작업의 실패 재현과 함께 수정하고, 무관한 MVP 선정 알고리즘·결과 화면 전면 개선 등은 자동으로 범위를 확대하지 않는다.
