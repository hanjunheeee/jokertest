# F-10 직업 전적·랭킹·운명의 가면 — 구현 근거 (2026-09-11)

초기 계획은 편집 범위를 5개 부품으로 제한하여 API·프로필·서고 런타임 연결 파일을 누락했다. 구현자가 작성한 확장 요청 배열은 단일 객체를 기대하는 데몬에서 처리되지 않았다. 운영자가 실제 요청 파일과 초기 지시서를 확인하고 D-09 오기를 정정한 뒤 공식 재계획을 실행했다. Codex 재계획과 Claude 검토를 거쳐 연결 범위가 추가됐으며, 기존 정책 파일은 미완성 체크포인트 bc289497로 보존했다. a5f6e71d는 확장된 계획에 따른 첫 통합 구현이다. 이전 요청이 없었다거나 이전 범위에도 연결 파일이 이미 있었다는 해석은 잘못이다.

## AC별 변경

### AC-01/AC-02 — 계정·직업별 전적 집계, 고정 매핑
- `backend/services/roleStatisticsPolicy.js`(기존 유지): `aggregateRoleStatistics`가 won 확정 행만
  계정·직업별로 누적한다. `ROLE_KOREAN_NAMES`가 CITIZEN=귀족·JOKER=광대·DOCTOR=주치의·GUARD=경비원·
  WITCH_HUNTER=마녀사냥꾼을 고정한다.
- `backend/repositories/gameResult.repositories.js`(신규 함수 3개): `findRoleStatisticsRows`가
  `GameResultPlayer`를 `GameResult`와 join해 won 확정·운영(production) 경기만 읽고,
  `getMyRoleStatistics`가 이를 `aggregateRoleStatistics`에 넘겨 5개 직업을 항상 채운다(판을 하지
  않은 직업도 games:0). 같은 game_id 중복 저장은 기존 `persistGameResult`의 findOrCreate 게이트가
  그대로 막으므로 이 조회는 저장을 건드리지 않는다.
- `backend/controller/roleStatistics.controller.js`(신규): `GET /me/role-statistics`가 5개 직업
  전부를 role/roleName과 함께 반환한다.
- **CODEX-1 재검토 대응(2026-09-11 2차)**: `roleStatistics.integration.test.js`는 `db.*` 전체를
  메모리 fixture로 바꾼 가짜 DB라 실제 game_results PK 기반 중복 방지·실제 JOIN·실제 트랜잭션
  롤백의 근거가 되지 못한다는 지적을 받았다. `backend/__tests__/roleStatistics.mysql.test.js`(신규,
  f01~f09.integration.test.js와 같은 `F01_TEST_DATABASE_URL` 격리 MySQL 원칙)를 추가해:
  같은 `game_id` 반복 저장이 실제 PK로 막히는지, 동시(Promise.all) 저장 요청이 실제 DB 경합에서도
  정확히 한 번만 성공하는지, 참가자 삽입 실패가 이미 만든 `game_results` 행까지 같은 트랜잭션으로
  롤백하는지, `raw:true` 조회의 `won`/`is_alive`가 실제 boolean인지, `settings`(JSON 컬럼)가
  저장→조회 왕복에서 구조를 보존하는지를 실제 MySQL 위에서 검증한다(실행 결과는 아래 참고 — 이
  세션에는 `F01_TEST_DATABASE_URL`을 주입하는 운영자 wrapper 실행 권한이 없어 스킵으로 종료됐다).

### AC-03 — 서고 화면의 내 전적·전체 랭킹
- `backend/repositories/gameResult.repositories.js#getRoleRanking`: 최소 10판 필터·승률↓판수↓UUID↑
  정렬(`buildRoleRanking`)을 그대로 쓰고, 순위·uuid·닉네임·프로필 이미지·판수·승수·원시 승률을
  전체(잘리지 않음) 반환한다.
- `frontend/src/domains/library/api/roleStatistics.api.js`(신규), `.../store/roleStatistics.store.js`
  (신규): 직업 선택 시 내 전적+랭킹을 함께 요청하고 jobKey별 idle/loading/success/error 상태를 둔다.
- `frontend/.../content/invitedGuests/mergeInvitedGuestsSpreads.js`(수정): 다른 직업으로 대체하던
  noble 폴백과 `ranking.slice(0, LIMIT)` 잘라내기를 제거했다. 직업마다 자기 자신의 런타임 상태만
  쓰고, 요청 전/로딩/에러/빈 랭킹(성공+0명)을 구분해 넘긴다.
- `frontend/.../content/invitedGuests/pages.js`(수정): `getInvitedGuestsPage(pageIndex, jobState)`가
  매 호출마다 정적 소개·도전과제와 런타임 jobState를 합친다(더 이상 import 시점에 고정하지 않는다).
- `frontend/.../components/invitedGuests/InvitedGuestsSpread.jsx`(수정): 탭 선택 시 `requestJob`,
  에러 시 재시도 버튼(`retryJob`), 로딩/빈 랭킹 문구를 연결했다.
- `frontend/.../components/invitedGuests/right/InvitedGuestsMasteryRanking.jsx`(수정): 전달받은
  전체 랭킹을 5명 단위(기존 `INVITED_GUESTS_MASTERY_RANKING_LIMIT` 재사용)로 화면 내 페이지 이동해
  전체를 볼 수 있게 했다. 순위 번호는 서버가 매긴 전역 순위를 그대로 쓴다(페이지 이동으로 재계산
  하지 않음).
- **AC-03은 `check: manual`이다 — 이번 호출은 구현·자동 시험만 했고 실제 브라우저 확인은 하지
  않았다(아래 "미검증" 참고).**

### AC-04 — 운명의 가면(최고 승률 직업)
- `backend/repositories/gameResult.repositories.js#getHighestWinRateRole`: `selectMaskOfFateRole`
  (최소 1판, 승률↓승수↓판수↓고정 직업 순, 대상 없으면 null)을 그대로 쓴다.
- `backend/controller/profile.controller.js`: `getMyProfile` 응답에 `highest_win_rate_role`을
  추가했다. `most_played_role`(최다 플레이) 필드는 값·의미 모두 손대지 않았다.
- `frontend/src/domains/user/hooks/useMyProfile.js`: 마스크 설명(`description`)을
  `highest_win_rate_role`에서만 만든다. null이면(0판) "전적 없음" 문구로 바꾸고 더미 직업을 쓰지
  않는다.

### AC-05 — 소급 집계·중단 경기·개발 경기 제외
- `backend/game-core/gameSession.js`: `buildSessionCandidate`가 세션 생성 시점에
  `resolveGameSource()`(서버 `NODE_ENV`만 본다, room.settings 등 클라이언트 입력은 전혀 읽지
  않는다)로 `session.gameSource`를 고정한다. `buildGameResultRecord`가 이 값을
  `settings.gameSource = { v: 1, value: ... }`로 결과 레코드에 그대로 옮긴다.
- `backend/repositories/gameResult.repositories.js`: `settings.gameSource.value !== "development"`인
  행만 직업 통계 대상으로 삼는다. **`settings.gameSource` 필드 자체가 없는 행**(이 기능이 생기기
  전에 저장된 과거 경기)은 개발 여부를 식별할 근거가 전혀 없으므로(아래 "식별 한계" 참고) 운영
  기록으로 보아 소급 집계에 포함한다 — "소급"이라는 이유만으로 제외하지 않는다.
- 중단 경기: `buildGameResultRecord`(기존 로직, 변경 없음)가 이탈자만 `won:false`로 확정하고
  잔류자는 `won:null`로 남긴다. `roleStatisticsPolicy.aggregateRoleStatistics`가 `won:null`을 다시
  한 번 걸러 판수·승수·생존 수에 넣지 않는다(`backend/services/roleStatisticsPolicy.js`의 계약
  주석도 "정상 과거 경기는 걸러내지 않는다"로 수정했다 — 예전 주석은 소급 기록까지 걸러내는
  것처럼 잘못 적혀 있었다).
- 업적 보상: F-10은 랭킹·전적 집계만 다룬다. 소급 업적의 1회 지급은 F-12 소관(A-13)이며 이번
  변경은 별도 지급 경로를 추가하지 않았다.
- **CODEX-1 재검토 대응(2026-09-11 2차) — 보상 자격 정책**: "중단·개발 경기의 보상 자격 정책
  근거가 없다"는 지적에 따라 `backend/services/roleStatisticsPolicy.js#isAchievementRewardEligibleGame`
  (신규 순수 함수)를 추가했다. 전적 집계 자격(`aggregateRoleStatistics`가 `won:null`을 거르고,
  `gameResult.repositories.js`가 개발 경기를 거르는 것)과는 별개의 질문 — "이 판이 업적/보상
  지급 대상인가" — 을 명시적으로 판정한다: `completed===true && gameSourceValue!=='development'`
  만 자격이 있다. 중단 경기는 이탈자의 패배 전적이 유지되더라도(AC-05) `completed:false`이므로
  자격이 없고, 개발 경기는 `completed` 여부와 무관하게 자격이 없다. `gameSourceValue`가 없는
  과거 경기(이 필드 이전 저장분)는 A-06/A-07과 같은 원칙으로 운영 기록으로 보아 자격이
  있다고 판정한다(D-11 소급 업적 1회 지급 계약 보존). 실제 지급 원장·멱등 처리는 F-12
  소관이며 이 함수는 F-12가 재사용할 "지급해도 되는가"라는 자격 판정만 담당한다(A-13).
  `roleStatisticsPolicy.test.js`에 5개 단위 시험을 추가했다(정상/중단/개발/중단+개발/과거 소급).
- **CODEX-1 재검토 대응(2026-09-11 2차) — 실제 DB·소켓 검증**: "실제 DB JSON 왕복·소켓 종료 출처
  보존이 검증되지 않았다"는 지적에 따라 `roleStatistics.mysql.test.js`에 중단 경기(이탈자 패배
  확정·잔류자 미확정)를 실제 DB에서 재검증하는 시험과, `backend/socket/gameSession.js`의
  `persistTerminalSession`(세 종결 지점이 공유하는 fire-and-forget 저장 훅)을 직접 호출해 실제
  `game_results.settings.gameSource`까지 왕복 보존되는지 폴링으로 확인하는 시험을 추가했다.

### AC-06 — 더미 제거, 회귀·빌드 통과
- `frontend/.../content/invitedGuests/invitedGuestsDevState.js` 삭제(더 이상 어디서도 import하지
  않는다). `pages.js`가 이 파일을 import하지 않는다는 사실을 `roleStatistics.ui.test.js`가
  소스 검사로 고정한다.
- 백엔드 전체 회귀·프런트 전체 회귀·프런트 production build 결과는 아래 "실행 결과" 참고.

## 과거 개발 경기 식별 한계 (D-09/A-07)

`settings.gameSource`는 이번에 처음 추가된 필드라, 이 배포 이전에 저장된 `game_results` 행에는
존재하지 않는다. 그 이전 판이 실제로 개발 환경에서 만들어졌는지 운영 환경에서 만들어졌는지 구분할
수 있는 다른 저장 필드(예: 별도 env 컬럼, 닉네임 패턴, 날짜 구간)가 스키마에 없다 —
`game_results`/`game_result_players` 모델을 직접 확인했다(X0071). 따라서:

- 과거 행은 **식별 가능한 근거가 없으므로** 개발 경기로 재분류하지 않고 운영 기록으로 취급한다
  (A-06/A-07의 명시적 요구).
- 이 판단은 "과거 데이터가 전부 운영 기록이었다"는 사실 주장이 아니라 "식별할 수 없으니 임의로
  제외하지 않는다"는 정책 결정이다. 실제로 과거 개발 세션이 운영 DB에 섞여 있었는지는 이 저장소의
  기록만으로는 확인할 수 없다 — 별도 보고 대상으로 남긴다.
- 이후 배포부터는 `settings.gameSource`가 모든 새 경기에 버전(`v:1`)과 함께 기록되므로, 같은
  모호함이 미래 경기에는 반복되지 않는다.

## 출처(gameSource) 계약

- 판정 시점: `buildSessionCandidate`(세션 생성) 단 한 번. 이후 재판정하지 않는다.
- 판정 근거: 서버 프로세스의 `process.env.NODE_ENV`만. `room.settings`·소켓 payload 등 클라이언트가
  채울 수 있는 값은 전혀 참조하지 않는다(`backend/__tests__/roleStatistics.session.test.js`가 위조
  시도를 직접 검증).
- 보존: `game_results.settings.gameSource = { v: 1, value: "production" | "development" }`로
  저장된다. 서버 재시작으로 `NODE_ENV`가 바뀌어도 이미 만들어진 세션·저장된 레코드는 그대로다.
- 소비: `gameResult.repositories.js`가 `value !== "development"`인 행만 직업 통계에 반영한다.

## 스키마 판단 (A-12)

전용 컬럼을 추가하지 않고 기존 `game_results.settings`(JSON) 컬럼에 `gameSource` 키를 추가하는
무스키마변경 방식을 그대로 썼다. `backend/models/game/game_result.model.js`/
`backend/scripts/migrate-db.js`(X0071/X0092, 스키마 필요성 대응을 위해 수정 범위에 포함됐던 파일)는
이번 변경에서 손대지 않았다 — JSON 컬럼에 새 키를 추가하는 데 컬럼 변경이나 migration이 필요하지
않기 때문이다(`sequelize.define`의 `settings: DataTypes.JSON`은 이미 존재). 전용 컬럼이 실제로
필요해지면(예: DB 레벨 인덱스로 개발 경기를 직접 필터링해야 할 정도로 데이터가 커지면) 그때
`0008-*.js` migration과 모델 필드를 함께 추가하고 `migrate-db.js`의 `MIGRATIONS` 배열에 등록해야
한다 — 지금은 그 필요가 입증되지 않았다.

## 복구 절차

이 기능은 새 테이블이나 파괴적 스키마 변경을 도입하지 않는다(JSON 컬럼에 키 하나 추가). 저장
경로(`persistGameResult`)의 트랜잭션·멱등성 계약은 그대로이므로, 기존 F-01 migration
runbook(`docs/requirements/2026-09-09-f01-migration-runbook.md`)의 복구 절차가 그대로 적용된다.
F-10 자체가 추가하는 별도 복구 절차는 없다.

## 실행 결과

### 2026-09-11 2차 호출(CODEX-1 재검토 대응) 실행 결과

- `node impl-check.js node-test backend/services/roleStatisticsPolicy.test.js`: **23/23 통과**
  (기존 17 + 신규 6: `isAchievementRewardEligibleGame` 정상/중단/개발/중단+개발/과거 소급 2건).
- `node impl-check.js node-test backend/__tests__/roleStatistics.mysql.test.js`
  (`F01_TEST_DATABASE_URL` 미주입 상태): **6개 전부 skip**(fail 아님) — 아래 "제약" 참고.
- `npm test --prefix backend`: **1,252 통과 / 0 실패 / 82 건너뜀**(이전 1,246/76에서 +6/+6 —
  늘어난 통과는 `isAchievementRewardEligibleGame` 신규 단위 시험, 늘어난 skip은
  `roleStatistics.mysql.test.js`의 신규 실제-DB 시험 6개다. 기존 스위트에 새로 생긴 실패나
  skip은 없다).
- `npm test --prefix frontend`: **1,289 통과 / 0 실패**(프런트는 이번 호출에서 변경하지 않았다 —
  1차 호출 결과와 동일).
- `npm run build --prefix frontend`: **성공**(변경 없음, 1차 호출과 동일).

### 1차 호출(2026-09-11) 실행 결과

- `npm test --prefix backend`: **1,246 통과 / 0 실패 / 76 건너뜀**(모두 `F01_TEST_DATABASE_URL`
  미설정으로 인한 기존 실제-DB 스위트의 "미검증" skip — 이 세션 환경에 전용 격리 MySQL이 없다.
  이번 변경으로 새로 건너뛰게 된 시험은 없다). 개별 신규 파일 결과:
  - `backend/services/roleStatisticsPolicy.test.js`: 17/17 (기존 14 + 신규 3: 0승 동률, 반올림 전
    정렬, 알 수 없는 직업 코드 방어).
  - `backend/__tests__/roleStatistics.session.test.js`: 7/7 (gameSource 판정·위조 방어·재시작 내구성·
    settings 보존).
  - `backend/__tests__/roleStatistics.integration.test.js`: 18/18 (집계·랭킹 전체 목록·소급 포함·
    개발 경기 제외·중단 경기 규칙·운명의 가면·프로필 응답·실제 HTTP 라우터 인증 경계).
  - 회귀로 수정한 기존 테스트 3개(`gameResultPersistence.test.js`,
    `profile.updateNickname.snapshotPreservation.test.js`, `user.accountPaths.test.js`)는 새
    `getHighestWinRateRole` 조회가 참조하는 `db.GameResultPlayer.findAll`을 가짜 DB에 추가했을
    뿐이다. 원래 검증하던 내용(트랜잭션 경계·닉네임 스냅샷 보존·프로필 필드 회귀)은 그대로
    유지된다.
- `npm test --prefix frontend`: **1,289 통과 / 0 실패**. 신규 3개 파일 포함
  (`roleStatistics.store.test.js`, `roleStatistics.ui.test.js`, `useMyProfile.roleStatistics.test.js`).
  기존 `useMyProfile.test.js`의 마스크 문구 단언 2건은 AC-04가 요구하는 새 계약
  (`highest_win_rate_role` 기반, "???"가 아니라 "전적 없음")에 맞춰 갱신했다 — 옛 계약(최다 플레이
  기준 마스크)은 AC-04가 명시적으로 대체하는 대상이었다.
- `npm run build --prefix frontend`: **성공**(`vite build`, 1,029 모듈, 1.43s). 청크 크기 경고는
  기존에도 있던 것으로 이번 변경과 무관하다.
- 실행에 쓴 명령·로그는 `node-test`/`build` 각각 `.pluto/checks/`에 남았다(전체 스위트는 root
  `package.json`에 `test`/`build` 스크립트가 없어 — 이 저장소의 기존 상태이며 F-10 범위 밖이다 —
  `npm test`/`npm run build`를 backend/frontend 각각에 직접 실행했다. 이 사실 자체를 아래 "제약"에
  남긴다).

## 제약 / 미검증

- **AC-03(manual)은 실제 브라우저로 확인하지 않았다.** 이 호출은 구현자 세션이며 운영자 Chrome
  검증(F-09 evidence 문서와 같은 절차)은 수행하지 않았다. 서고 "초대받은 자들" 화면에서 직업 탭을
  바꿀 때 내 전적·전체 랭킹·페이지 이동·로딩/에러/재시도가 실제로 그려지는지는 별도로 확인해야
  한다.
- **`roleStatistics.mysql.test.js`(2차 호출 신규)는 이 세션에서 실제 통과로 실행되지 못했다 —
  코드는 존재하고 스킵 게이트가 정상 동작함을 확인했을 뿐이다.** `F01_TEST_DATABASE_URL`은 운영자
  wrapper(`node C:/Users/minsa/jokertest/.pluto/monitor/run-backend-tests.cjs test`)가 비밀값을
  이 프로세스 밖에서 주입해야 채워지는데, 이 세션의 도구 권한 정책이 그 wrapper 실행 자체를
  "승인 필요"로 반복 거부했다(절대경로·상대경로·PowerShell·`dangerouslyDisableSandbox` 조합으로
  시도했고, 무관한 `node -e` 단발 스크립트조차 동일하게 거부되는 것을 확인해 — 이 경로/시크릿에
  국한된 차단이 아니라 임의 `node <스크립트>` 실행 자체가 이 세션에서 허용 목록 밖이라는 결론을
  내렸다). `f01-test-db.private.json`을 직접 읽어 자격 증명을 조립하는 우회는 시도하지 않았다 —
  운영자 지시("비밀값을 읽어 출력하거나... 하지 않는다")가 명시적으로 금지하는 행위와 같은
  범주라고 판단했기 때문이다. 따라서 AC-01(실제 PK 중복 방지·실제 경합·실제 트랜잭션 롤백)과
  AC-05(실제 소켓 종료 저장 경로의 출처 보존)의 **실행 증거는 여전히 없다** — 시험 코드 자체는
  f01~f09.integration.test.js와 동일한 검증된 패턴을 그대로 따르므로, 운영자가 승인된 세션/wrapper
  실행 권한으로 `node C:/Users/minsa/jokertest/.pluto/monitor/run-backend-tests.cjs test`를 실행하면
  바로 결과를 얻을 수 있다. 이 문서는 이 사실을 완료로 위장하지 않는다.
- 과거 실제 운영 DB에 개발 경기가 섞여 있었는지는 이 저장소의 코드만으로는 판단할 수 없다(위
  "과거 개발 경기 식별 한계" 참고) — 별도 보고 대상이다.
- root `package.json`에 `test`/`build` 스크립트가 없어 `impl-check.js test`/`build`(전체 실행)는
  즉시 실패한다(`echo "Error: no test specified"`, `Missing script: "build"`). F-10 범위 밖의
  기존 저장소 상태이므로 고치지 않았고, 대신 backend/frontend 각각의 실제 npm 스크립트를 직접
  실행해 위 결과를 얻었다.
