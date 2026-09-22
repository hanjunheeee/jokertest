# F-28 최종 자동 검증 · 병합 · 미검증 보고서

- 슬라이스: BN (F-28 통합 인수·회귀 검증). 부속 근거: [`integration-contract.md`](integration-contract.md).
- 작성일: 2026-09-22.
- **결론(요약)**: BN 자동 산출물(시험·빌드·격리 DB 회귀·병합 확인·미검증 대장)은 아래 1~3절대로 기록했다. 실제 Chrome·다중 사용자·실제 메일·토스 결제창·청음 인수는 **남아 있다**(4절). 따라서 이 보고서는 "배치 전체 실제 인수 완료"를 선언하지 않으며, 모니터 종료 근거로 쓰지 않는다.

## 1. 대상 · 후보 · 범위

| 항목 | 값 |
|---|---|
| 시험 실행 기준 커밋 | `f8036271b13e50e5c5d971eca8d2bf521646066a` (실행기 기록 `dirty:false`, tree `9478d06c…`) |
| 인수 후보 SHA | BN 구현 커밋(이 문서 두 개만 추가). 시험 실행 뒤의 변경은 `docs/test-evidence/f28/*.md` 두 문서뿐이라 코드·시험 결과에 영향이 없다. 공식 검증 단계가 후보 SHA에서 전체 명령을 다시 돌린다. |
| 런타임 | node v24.20.0 / win32 x64 |
| 격리 DB | `pluto_f01_20260909_al`(주 연결 — DB 로그의 `TABLE_SCHEMA = 'pluto_f01_20260909_al'`로 확인), `pluto_f01_20260909_al_restore_check`(f01 AC-05 복구 검증). `isolatedTestDb.js`의 `ALLOWED_DATABASE_NAMES`가 이 두 이름만 허용 |
| 사용자 DB·볼륨 | 건드리지 않음. 모든 DB 시험은 실행기가 주입한 격리 URL로만 연결 |

수량: 원래 배치 항목 **32개**(F-01~F-32). F-28 자신을 뺀 점검 행 **31개**. 그중 F-22는 **취소**(강제종료 제거, `docs/requirements/2026-09-18-remove-host-force-end.md`, 커밋 `57f18672`)라 병합 완료로 세지 않는다 → 선행 정상 병합 대상 **30개**. F-28 포함 취소 제외 유효 기능 **31개**. 분할 슬라이스는 부모 기능 행에 귀속한다.

## 2. AC-01 — 명령별 실행 결과

| # | 명령 | 실행(기준 커밋 · 실행 시각 UTC) | 로그 | 결과 |
|---|---|---|---|---|
| 1 | `npm ci --prefix frontend` | BN 구현 단계 | 콘솔 | exit 0 (212 packages) |
| 2 | `npm ci --prefix backend` | BN 구현 단계 | 콘솔 | exit 0 (249 packages; bcrypt install script 미승인 경고 — prebuild 사용, 이후 DB 시험 정상) |
| 3 | `npm test --prefix frontend` | impl-check `test --prefix frontend` · `f8036271`(dirty:false) · 2026-09-22T09:04:08Z → 09:06:32Z | `.pluto/checks/1790067848801-32028-test.log` | **exit 0 · tests 2473 · pass 2466 · fail 0 · skipped 7** |
| 4 | `npm run build --prefix frontend` | impl-check `build --prefix frontend` · `f8036271`(dirty:false) · 2026-09-22T09:06:34Z → 09:06:44Z | `.pluto/checks/1790067994789-33508-build.log` | **exit 0** (vite 1063 modules; 500 kB 초과 chunk 경고만) |
| 5 | `npm run test:game-core --prefix backend` | impl-check `node-test --prefix backend game-core/__tests__/*.test.js`(9개 파일, 스크립트와 같은 집합) · `f8036271`(dirty:false) · 2026-09-22T09:07:06Z → 09:07:16Z | `.pluto/checks/1790068026084-38736-node-test.log` | **exit 0 · tests 551 · pass 551 · fail 0 · skipped 0** |
| 6 | 격리 DB 회귀(관련 부분집합, f01 선두) | impl-check `node-test --prefix backend` 15개 파일 · `f8036271`(dirty:false) · 2026-09-22T09:07:24Z → 09:20:11Z | `.pluto/checks/1790068044243-23288-node-test.log` | **exit 0 · tests 214 · pass 214 · fail 0 · skipped 0** (12분 47초) |
| 7 | `npm test --prefix backend` (전체) | 승인 실행기 `node C:/Users/minsa/jokertest/.pluto/monitor/run-backend-tests.cjs test`. **(a) BN 재시도(2026-09-22)에서 이 명령을 두 번 실행하려 했으나 도구 승인 대기로 거부되어 실행되지 않았다**(형태를 바꿔 우회하지 않음 — `.pluto/progress.md`). **(b) 가장 최근의 공식 실행**: CJ 검증 VERIFY-5(CJ 후보 → 병합 `eb248a73`), 종료 2026-09-22T07:34:53Z, 소요 1570.8초(약 26분) | `C:/Users/minsa/jokertest/.pluto/monitor/backend-full-2026-09-22T07-34-53.290Z.log` | (b): **exit 0 · tests 2394 · pass 2394 · fail 0 · cancelled 0 · skipped 0**. 영향 대조: `git diff --stat eb248a73 HEAD`는 `.md` 문서 4개(요구 1·체크리스트 1·이 보고서 2)뿐 → backend 코드·시험·package.json이 같다. 단, **이번 BN 후보 SHA 자체에서 돈 실행은 아니다** — 이번 후보의 backend 전체 판정은 검증 단계의 같은 실행기 결과로 확정한다. |

6번의 파일: `tests/db/f01-migrations.integration.test.js`, `f09-store-purchases`, `f12-achievements.integration`, `f12-achievements.api`, `f12-achievements.recovery`, `f13-profile-equipment`, `f19-friends-invites`, `f29a-find-id`, `f29b-password-reset`, `f31-social-email`, `f32a-topup`, `f32b-gold-purchases`, `services/achievementService.test.js`, `services/achievementDefinitions.test.js`, `socket/__tests__/spectatorAccess.test.js`.

**skip 7건(3번)** — 통과로 세지 않는다: `frontend/src/domains/auth/pages/__tests__/F29Recovery.integration.test.js`의 7개 시험(`F01_TEST_DATABASE_URL`이 frontend 시험 실행에 주입되지 않아 "미검증"으로 skip). 같은 서버 계약은 6번의 `f29a-find-id`·`f29b-password-reset` DB 시험이 PASS로 대신 근거를 대지만, 프론트 화면↔실제 DB 왕복 자체는 **미검증**이다.

## 3. AC-02 · AC-03 · AC-04 판정

| AC | 자동 근거(이번 실행) | 판정 | 남은 것 |
|---|---|---|---|
| AC-02 격리 DB 회귀 | 6번 로그: f01 이관·백업·복구(`AC-05: DDL 부분 실패 후 전체 백업 복원으로…` PASS), 인증(f29a·f29b·f31), 경제(f09·f13·f32a·f32b), 업적(f12×3, achievementService/Definitions). 전적(F-10 roleStatistics·F-11 voteParticipation DB 시험)은 7번 backend 전체에 포함 | 자동 부분 PASS · 전적 DB는 검증 단계 판정 | 운영자 재로그인·서고·장착 복원 비교(4절) |
| AC-03 개별/일괄 무차감 | 6번 로그의 f09: 개별 `AC-01: 커밋 전 DB 오류(EconomyPurchaseRequest 기록 실패)…` · 기보유 재구매 · 검증 실패 4건 / 일괄 `AC-02: 두 번째 품목 지급 단계에서 DB 쓰기가 실패하면…` · 구매 불가·총액 초과·기보유 혼합 / 응답 유실 `AC-04:` 4건 — 모두 PASS | **PASS** (별도 행 확인, 계약서 3절) | Chrome 화면/DB 비교(4절) |
| AC-04 관전 제거 · 사망 참가자 | 6번 spectatorAccess(외부 입장 거부·snapshot 거부·수신 0/1) PASS, 3번 deadParticipant(`…계속 보기는 서버 요청 0회다` 등) PASS, 방관리 관전 항목 부재 PASS, RESTORE(nextRoomSettings `F-24(AC-04) · 실제 시작 방송 → …`) PASS | 자동 PASS | 다중 계정 실제 게임(4절) |

## 4. AC-05 — 기능별 병합 · 자동 시험 행

병합 확인 방법: `git log` 에서 각 병합 커밋이 HEAD `f8036271` 이력에 있음을 확인(체크리스트 4절 원장 46개 전부 확인). "자동"은 이번 BN 실행(2절 3·5·6번)에서 실제로 통과한 근거, "검증 단계"는 7번 backend 전체가 판정할 부분이다.

| 기능 | 병합 커밋(분할 귀속) | 이번 실행의 자동 근거 | 판정 |
|---|---|---|---|
| F-01 DB 변경·이관 | AL `ba6d4695` | f01-migrations (6) | 병합 ✓ · PASS |
| F-02 회원가입 입력·중복 | AM `0950d00a` | signupValidation 닉네임 등 (3) · 서버 f02는 검증 단계 | 병합 ✓ · 프론트 PASS |
| F-03 로그인 유지·세션 | AN `4277a6e6` | 소켓 재인증 시험 (3) · 서버는 검증 단계 | 병합 ✓ · 프론트 PASS |
| F-04 계정관리 | AO `c78b7764` | 프론트 (3): `frontend/src/domains/user/hooks/__tests__/useNicknameForm.test.js` — `AC-03: 닉네임 변경 성공 시 재요청 없이 auth store와 마이페이지 표시(useMyProfile)가 즉시 새 닉네임으로 갱신된다`, `AC-03: 닉네임 변경 실패 시 auth store와 마이페이지 표시 모두 변경 전 닉네임을 그대로 유지한다`; `frontend/src/domains/auth/validation/__tests__/signupValidation.test.js` — `F-04 AC-04: bcrypt 72바이트를 넘는 비밀번호는 거부된다(멀티바이트 문자 포함)` (3번 로그 ✔) · 서버 f04는 검증 단계 | 병합 ✓ · 프론트 PASS |
| F-05 소셜 공통 | AP `331d5762` | f31-social-email 소셜 경로 (6) · f05는 검증 단계 | 병합 ✓ · PASS(부분) |
| F-06 Google 로그인 | AQ `635c929b` | f31 Google identity 재로그인 (6) | 병합 ✓ · PASS(부분) |
| F-07 Discord 로그인 | AR `ee1f45a1` | f31 제공자 분기 (6) · f07은 검증 단계 | 병합 ✓ · PASS(부분) |
| F-08 지갑·거래·소유권 | AS `bdefdd2d` | f09·f32b 원장 계약 (6) · f08은 검증 단계 | 병합 ✓ · PASS(부분) |
| F-09 상품 구매·이모티콘 탭 | AT `9351a5b8` | f09 18건 (6) · 이모티콘 거부 AC-05 2건 | 병합 ✓ · PASS |
| F-10 전적·랭킹·운명의 가면 | AU `0c470cc6` | 프론트 (3): `frontend/src/domains/user/hooks/__tests__/useMyProfile.roleStatistics.test.js` — `최다 플레이(most_played_role)와 최고 승률(highest_win_rate_role)이 다르면 후자를 강조 문구로 쓴다`, `highest_win_rate_role이 null이면(전적 0판) 더미 직업 대신 전적 없음을 표시한다`, `A 보류 → B 전환 → B 성공 → A 응답 도착: B의 닉네임·판수·승률·가면이 그대로 유지된다`; `frontend/src/domains/user/hooks/__tests__/useMyProfile.test.js` — `0판 계정의 승률은 0.0%다` (3번 로그 ✔) · 랭킹 화면 자체의 프론트 자동 시험은 이 표에 지목하지 않음(운영자 U-08) · 서버 통계 DB는 검증 단계 | 병합 ✓ · 프론트 PASS |
| F-11 투표 참여 집계 | AV `88f5d793` | achievementService 투표 지표 (6) · 영속 DB는 검증 단계 | 병합 ✓ · PASS(부분) |
| F-12 22개 업적 | AW `81236f71` | f12×3 · achievementService · achievementDefinitions (6), 서고 store/integration (3) | 병합 ✓ · PASS |
| F-13 프로필·테두리 | AX `c544d20c` | f13-profile-equipment (6) · accountProfileEquipment (3) | 병합 ✓ · PASS |
| F-14 스킨·카드 장착 | AY `f5682a1f` | skinCardWear.store (3) · f14 DB는 검증 단계 | 병합 ✓ · 프론트 PASS |
| F-15 일반·채팅 설정 | AZ `27a9de3c` | 설정 시험 (3) | 병합 ✓ · PASS (전체화면 예외는 운영자) |
| F-16 효과음·금지 음악 무음 | BA `24292865` | sfxPlayer · bgmPlaybackLock (3) | 병합 ✓ · PASS (청음 운영자) |
| F-17 알림 | BB `11e95027` | notificationRuntime (3) · f17 DB는 검증 단계 | 병합 ✓ · 프론트 PASS |
| F-18 로비·명예의 전당 제거 | BC `ae40d975` | f18Lobby (3) | 병합 ✓ · PASS |
| F-19 친구·차단·초대 | BD `38d1659a` | f19-friends-invites (6) · friendInviteRuntime (3) | 병합 ✓ · PASS |
| F-20 대기방 설정 변경 | BE `f0977996` | roomSettings.integration (3) | 병합 ✓ · PASS |
| F-21 방장 추방 | BF `68802611` | 방관리 "플레이어 추방" 유지 (3) · 서버 추방은 검증 단계 | 병합 ✓ · 프론트 PASS |
| **F-22 강제종료** | **취소** (`57f18672`) | roomSettings.integration L528-529 "강제 종료" 부재 단언 — 시험 `F-23(AC-01/AC-02) · 실제 인게임 방관리 탭에 관전자 항목이 없고…` PASS (3) | **취소 · 버튼 재등장 없음 확인**(병합 수에 넣지 않음) |
| F-23 관전자 전면 제거 | BH `b2e2e4cd` (BR·BS·BT 분할 귀속) | spectatorAccess (6) · deadParticipant F-23 시험 (3) | 병합 ✓ · PASS |
| F-24 방 코드·설정 유지 | BI `a2bfc1ab` | nextRoomSettings.integration (3) | 병합 ✓ · PASS |
| F-25 밤 순차 판정 | BJ `6acc892b` (BU `152f216a`, BV `98cf4b71`) | game-core 551 (5) · deadParticipant F-25b (3) | 병합 ✓ · PASS |
| F-26 능력 이벤트 | BK `13535a72` (BY `d8c45bf3`, CD `38f958a3`) | 프론트 성공 사건 수신 (3): `frontend/src/domains/game/ingame/store/__tests__/nightPrivateResult.test.js` — `AC-01: 역할별 성공 사건을 수신하면 store에 사건 ID·밤 번호가 저장되고, 같은 사건 ID 재전달은 중복 추가되지 않는다`, `AC-05 결합: completeNightSuccess의 emit이 registerGameHandlers가 등록한 실제 서버 리스너로 전달된다`; `frontend/src/domains/game/ingame/hooks/__tests__/useInGameSessionSnapshotSync.test.js` — `F-26(AC-01): 기존 판의 재접속 응답에 실린 미완료 사건이 실제 ack 경로로 큐에 복원된다`; `frontend/src/domains/game/ingame/store/__tests__/applySessionSnapshot.test.js` — `F-26(AC-04): 현재보다 과거 날짜의 스냅샷은 거부된다 — store는 완전히 변경되지 않는다` (3번 로그 ✔) · 서버 socket은 검증 단계 | 병합 ✓ · 프론트 PASS |
| F-27 직업별 영상 | BL `f6e93c8d` (BZ `77aaef8a`, CE `9b8d73f3`, CI `4719997b`, CJ `eb248a73`) | nightPresentation (3) | 병합 ✓ · PASS (브라우저·청음 운영자) |
| F-29 아이디·비밀번호 찾기 | BM `5fa62b0c` (BW `9055612b`, BX `c17e5c59`, CF `e96363dd`) | f29a · f29b (6) · F29Recovery **skip 7** (3) | 병합 ✓ · 서버 PASS · 프론트↔DB 왕복 미검증 |
| F-30 피의 기록·명성 제거 | BO `743dac3d` | myPageBloodRecord · 로비 배너 (3) | 병합 ✓ · PASS |
| F-31 가입 이메일 인증 | BP `5d8565da` (CA `72a6bb90`, CG `7cdf548d`) | f31-social-email (6) · SignupEmailVerification · SocialSignupEmailVerification UI (3) · f31a DB는 검증 단계 | 병합 ✓ · PASS |
| F-32 다이아 충전·골드 구매 | BQ `038c5b8b` (CB `0facbace`, CC `a738af5e`, CH `24c75aa6`) | f32a · f32b (6) · F32CurrencyPurchase UI (3) | 병합 ✓ · PASS (토스 결제창 운영자) |

집계: 정상 병합 확인 30/30, 취소 1(F-22, 재등장 없음 확인). 이번 실행에서 FAIL 0. skip 7(F-29 프론트 DB 왕복). backend 전체는 검증 단계 판정 대기.

## 5. AC-06 — 미검증 대장 (체크리스트 1~3절 전부 + 보충)

담당은 모두 **운영자**(계정 생성·비밀번호 입력·실제 브라우저 조작은 운영자 몫). 상태는 모두 **미검증**이다.

| # | 출처 | 항목 | 미검증 사유 | 필요 입력 | 기대 관측값 |
|---|---|---|---|---|---|
| U-01 | F-29a | 로그인 → 아이디 찾기 → 마스킹 이메일 / 틀린 입력 공통 안내 / 연속 시도 제한 / 뒤로 가기 | 실제 Chrome 미실행 | 실행 중 서버·기존 계정 | 마스킹 이메일만, 제한 안내, 뒤로 가기 정상 |
| U-02 | F-29a·F-31a | `backend/utils/ip.js::getClientIp`의 X-Forwarded-For 신뢰(기존 결함 후보, 조각 밖) | 코드 수정 범위 밖 — 별도 작업 | 배포 프록시 구성 결정 | 프록시 없는 배포에서 IP 한도 우회 불가 |
| U-03 | F-29b | 실제 재설정 메일 수신 | 외부 입력 없음 — 자동 시험은 메모리 어댑터 | 메일 서비스 계정·발신 주소·앱 기본 URL | 링크 메일 수신 → 새 비밀번호 로그인 |
| U-04 | F-29b | 재설정 뒤 다른 브라우저 소켓이 5초 안팎에 끊김, 5초 주기 세션 조회 부하 | 다중 브라우저 미실행·부하 미측정 | 두 브라우저 | 5초 안팎 끊김, 주기값 운영 전 검토 |
| U-05 | F-29b | `has_local_password` backfill 운영 DB 표본 확인 | 격리 DB에서만 검증 | 운영 DB 읽기 권한 | 소셜 가입 수 = false 분류 수 |
| U-06 | F-30 | 피의 기록 두 항목·API 값 일치·0판 0.0%·서버 끊김 실패 안내·재시도 | 실제 Chrome 미실행 | 0판/다판 계정 | 두 행, 0.0%, 실패 안내·재시도 |
| U-07 | F-30 | 로비·마이페이지 명성 흔적 없음, 긴 한글 닉네임 최대 글자·좁은 창 넘침 없음 | 실제 Chrome 미실행 | 긴 닉네임 계정 | 넘침 없음 |
| U-08 | F-30 | 업적·랭킹·운명의 가면 값이 이전과 같음 | 실제 데이터 비교 미실행 | 이전 값 기록 | 값 동일 |
| U-09 | F-31a | 실제 인증번호 메일, 재발송 뒤 이전 번호 거부, 5회 오입력 잠금, 시간당·일당 한도 문구 | 외부 메일 입력 없음 | 메일 서비스 계정 | 메일 수신·거부·잠금·한도 문구 |
| U-10 | F-31a | 가입 실패 응답에 서버 내부 문구 없음(중복 이메일·닉네임은 기존 문구) | 실제 Chrome 미실행 | — | 내부 문구 미노출 |
| U-11 | F-31b | 발송 → 60초 재발송 대기 → 확인 → 가입, 만료·횟수 초과·요청 제한·통신 실패 문구 구분 | 실제 Chrome 미실행 | 메일 또는 개발용 번호 확인 수단 | 각기 다른 문구 |
| U-12 | F-31b | 이메일 변경 시 인증 해제·가입 버튼 재잠금, 연타 시 계정 1개 | 실제 Chrome 미실행 | — | 계정 1개 |
| U-13 | F-31b | 개발자 도구 저장소·쿠키·콘솔에 가입 증명 값 없음 | 실제 Chrome 미실행 | — | 값 없음 |
| U-14 | F-31 | Google/Discord 첫 가입: 제공자 인증 이메일이면 바로 가입, 아니면 자체 인증 화면, 인증 없는 완료 요청 거부 | 실제 제공자 미연동 — 자동 시험은 로컬 OAuth fixture | 제공자 앱 설정·테스트 계정 | 분기·거부 |
| U-15 | F-31 | 기존 소셜 계정 로그인에 추가 인증 강제 없음 | 실제 제공자 미연동 | 기존 소셜 계정 | 바로 로그인 |
| U-16 | F-32c | 상점 재화 탭 서버 상품 표시, 키 미설정 시 '설정 대기'·결제창 없음, test 키면 결제창 → 복귀 → 확인 중 → 완료 → 잔액 갱신, 골드 부족·완료·가격 변경 재확인 | 토스 test 키 없음·Chrome 미실행 | 토스 test client/secret 키 | 상태 전이·잔액 갱신 |
| U-17 | F-32 | Chrome 두 창: 느린 confirm 중 다른 창/재로그인에서 진행 중 주문 발견 → 이어서 완료 → 잔액 1회 증가, 계정 전환 뒤 이전 계정 주문 비노출 | 다중 창 미실행 | 두 창·두 계정 | 1회 증가·격리 |
| U-18 | F-32 | 실제 결제창 → 복귀 → 완료 → 잔액·내역 갱신 | 토스 test 키 없음 | 토스 test 키 | 갱신 |
| U-19 | F-27d | Safari·iOS·Chrome 역할 영상(킬 USER/TARGET·치료·조사·확인) 투명 canvas 합성·소리·다음 사건 진행, 재생 차단 시 재시도·건너뛰기 | 실제 브라우저·기기 미실행, 청음 미수행 | Safari·iOS 기기 | 검은 배경 없음·소리·진행 |
| U-20 | 2절 통합 | 가입 → 다이아 테스트 충전(키 없으면 '설정 대기'까지) → 골드 구매 → 상점 구매 → 프로필/장비 → 로그아웃 → 재로그인 복원 | 실제 서버·Chrome 미실행 | 승인 DB 연결 서버, 토스 키(선택) | 각 단계 값이 DB와 일치, 복원 |
| U-21 | 2절 통합 | 기존 계정·검증된 소셜 계정 로그인, 전적 두 항목, 명성 제거, 업적/랭킹 원본 보존 | 실제 Chrome 미실행 | 기존·소셜 계정 | 보존 |
| U-22 | 2절 통합 · AC-04 | 다중 계정 게임 → 확정 사망 → 계속 보기·결과 수신 → 재접속 → 명시적 나가기 → 이후 수신 차단, 외부 계정 입장 거부 | 다중 사용자 실제 게임 미실행 | 3~5개 계정 | 선택 유지·차단·거부 |
| U-23 | 3절 | 실제 메일 수신(재설정·가입 인증) | 메일 서비스 계정·발신 주소 미제공 | 같음 | 수신 |
| U-24 | 3절 | 실제 토스 테스트 결제창 | test client/secret 키 미제공 | 같음 | 결제 완료 |
| U-25 | 3절 · SFX-INTEGRATION-28 | 효과음·영상 내장음 실제 청음 | 사람의 청음 필요 — 자동 시험은 재생 호출·음소거·볼륨 값만 확인 | 스피커·사람 | 각 사건별 1회 청음 |
| U-26 | SFX-INTEGRATION-28 | F-17 알림·F-19 초대 소리 | **정책상 무음**: 배포 manifest의 `system-notification`·`game-invite` 자산이 `asset-unreviewed` → 매체 생성 0·재생 0(시험으로 확인). 자산 미검토이지 재생 오류가 아님 | 자산 검토·승인 | 승인 후 최초 live 1회 청음, 복원·재접속 무음 |
| U-27 | RESTORE-INTEGRATION-28 | 승인 DB·실제 순차 게임에서 유지 → 종료 → 다음 방 생성 복원, 해제 뒤 기본값, A→B→A 계정 격리, 저장·해제 실패 안내 | 실제 순차 게임 미실행 | 두 계정·서버 | 값 복원·격리·실패 안내 |
| U-28 | AC-03 보충 | Chrome의 개별 실패·묶음 실패·응답 유실 복구와 화면/DB 비교 | 실제 Chrome 미실행 | 격리 DB 연결 서버 | 무차감·복구, 화면=DB |
| U-29 | F-15 | 전체화면 사용자 담당 확인(기존 예외) | 브라우저 전체화면 정책은 자동화 불가 | 실제 Chrome | 전체화면 전환·복귀 |
| U-30 | F-29 프론트 | `F29Recovery.integration.test.js` 7건의 화면↔실제 DB 왕복 | frontend 시험 실행에 격리 DB URL이 주입되지 않아 skip | 격리 DB 주입 실행 | 7건 PASS |
| U-31 | F-32 · 계약서 5.3 | **재시작 없는 상품 변경과 기존 주문 조건 보존**: 서버를 띄운 채 별도 DB 연결로 다이아 상품 등록 → 상점 재화 탭 다음 조회에 표시 → 가격·지급량·보너스 수정(version 증가) → 재조회 반영, 옛 version 주문은 `PRODUCT_VERSION_MISMATCH`로 거부 → 판매 중지(`PRODUCT_STOPPED`)·삭제(`PRODUCT_NOT_FOUND`) 뒤 신규 주문 거부. 변경 **전에** 만든 주문은 `createTopupOrder`(`backend/service/topup.service.js`)가 저장한 스냅샷대로 승인·지급된다 | 실제 서버·Chrome·결제창에서 미실행. 자동 근거는 격리 DB·가짜 결제 어댑터 안의 것뿐: `backend/tests/db/f32a-topup.integration.test.js` — `AC-06: 별도 연결의 상품 등록·수정·판매 중지·삭제가 서버 재시작 없이 목록·주문에 반영된다`, `AC-01(A-03): 주문 뒤 상품 가격·지급량·version 변경과 삭제에도 승인 금액 1000·지급량 110이 유지된다`(2절 6번 PASS). 실제 결제창 승인은 토스 test 키 부재(U-18·U-24와 같은 사유) | 승인 DB에 연결한 실행 중 서버, DB 쓰기 가능한 별도 연결(운영자), 시험 계정, 1000원·100D+10 보너스 시험 상품, (선택) 토스 test 키 | 서버 재시작 없이 목록이 매번 DB 값과 같다; 옛 version 주문 409 + 현재 상품 재확인 안내; 중지·삭제 뒤 신규 주문 거부; 변경 전 주문의 승인 금액 1000원·지급 110D 유지(변경 뒤 가격 5000으로 확인하면 `AMOUNT_MISMATCH`), 삭제 뒤에도 기존 주문 행 유지·지급 1회 |

구분 원칙: 미준비 자산(U-26) · 정책상 무음(U-26) · 재생 오류(자동 시험은 주입한 load reject·play 실패의 처리만 확인했고, 실제 브라우저 재생 오류는 관측하지 않았다 — U-19·U-25에 포함) · 브라우저 미실행(U-01, U-06~U-22, U-27~U-29, U-31) · 청음 미수행(U-19, U-25) · 외부 입력 미제공(U-03, U-09, U-14~U-16, U-18, U-23, U-24, U-31의 결제창 부분)을 합치지 않았다.

## 6. BN 자동 산출물 판정과 전체 실제 인수의 잔여 상태

- **BN 자동 산출물**: 2절 1~6번 exit 0, FAIL 0. skip 7(F29Recovery, 프론트 DB 왕복)은 PASS로 세지 않았다. backend 전체(7번): BN 재시도의 승인 실행기 호출은 도구 승인 대기로 실행되지 못했다. 코드가 같은 직전 공식 실행(CJ VERIFY-5, `eb248a73`)은 2394/2394 PASS이지만, 이번 후보에서 돈 실행이 아니므로 이번 후보의 판정은 검증 단계 결과로 확정한다.
- **전체 실제 인수**: 5절 U-01~U-31이 미검증으로 남아 있다. 이 항목들이 운영자 확인으로 닫히기 전에는 배치 F-01~F-32의 전체 완료나 모니터 종료를 선언하지 않는다.
