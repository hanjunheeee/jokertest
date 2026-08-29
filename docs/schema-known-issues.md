# 스키마 알려진 문제 (DB3 정리 슬라이스 기록)

이 문서는 `game_results` · `game_result_players` · `concurrent_snapshots` 테이블을 추가하고
죽은 DB 진입점을 정리하면서 확인했지만 **이번 슬라이스에서 코드를 고치지 않기로 한** 항목을
남긴 기록이다. 아래 항목은 전부 조사·기록만 했고 컬럼을 바꾸거나 지우지 않았다.

## 테이블 생성 경로

스키마는 마이그레이션이 아니라 모델 정의 동기화로 만들어진다. `backend/index.js`가 기동할 때
`db.sequelize.sync({ force: false })`를 호출하고, `backend/models/index.js`의 재귀 로더가
`backend/models/**` 아래 모델 파일을 전부 읽어 등록한다. 따라서 새 테이블은 모델 파일 추가로
생기고, 별도의 마이그레이션 파일을 쓰지 않는다.

정리한 죽은 진입점:

- `backend/.sequelizerc` — `seeders`/`migrations` 경로를 가리켰지만 두 디렉터리는 저장소에
  존재한 적이 없다. 파일을 삭제했다.
- `backend/package.json`의 `db:migrate` · `db:migrate:undo` · `db:seed` · `db:seed:undo` —
  위 경로가 없어 실행하면 실패하는 명령이라 삭제했다.
- `backend/package.json`과 루트 `package.json`의 `game:harness` — 실행 대상인
  `backend/game-core/harness.js`가 없다. 두 곳 모두 삭제했다.
- `sqlite3` 의존성 — 모든 환경의 `config/config.json` dialect가 `mysql`이고 저장소 어디에도
  `require("sqlite3")`가 없다. `backend/package.json`과 `backend/package-lock.json`에서
  제거했다. 로컬 sqlite 파일(`backend/data/game.sqlite`)은 작업 트리에도 git에도 없다.

### 남은 후속 정리 (이번 범위 밖)

- `backend/package-lock.json`에 `sqlite3`만 쓰던 전이 의존성(`bindings`, `prebuild-install`,
  `tar`, `node-gyp` 등)의 항목이 남아 있다. `npm ci`는 그대로 성공하지만 쓰지 않는 패키지를
  설치한다. 다음에 `npm install`을 한 번 돌리면 lock에서 자동으로 정리된다. 손으로 지우면
  참조 관계를 잘못 판단할 위험이 있어 하지 않았다.
- `.gitignore`의 `backend/data/*.sqlite` 두 줄은 sqlite를 쓰지 않게 된 뒤로 의미가 없다.
- `sequelize-cli` 의존성은 `db:*` 스크립트와 `.sequelizerc`가 사라져 더 쓰이지 않는다.
  의존성 제거는 이번 성공 조건(sqlite3만 제거)의 범위 밖이라 남겼다.

## 쓰이지 않는 테이블

정의만 있고 읽기·쓰기 코드가 저장소 어디에도 없는 테이블이다. `sync`가 테이블은 만들지만
데이터는 영원히 비어 있다.

| 테이블 | 상태 |
| --- | --- |
| `password_reset_tokens` | 모델과 `User.hasMany` 관계만 있고 비밀번호 재설정 흐름(발급·검증·소모)이 없다. |
| `account_find_requests` | 계정 찾기 요청 로그를 남기는 코드가 없다. 관계도 없는 독립 테이블이다. |
| `traffic_logs` | 요청 로그를 적재하는 미들웨어가 없다. `morgan`은 콘솔로만 출력한다. |

셋 중 어느 것도 이번에 지우지 않았다. 실제 기능(비밀번호 재설정, 계정 찾기, 트래픽 집계)을
붙일 때 스키마를 다시 확정하는 편이 안전하기 때문이다.

## 기존 테이블 개수

작업 지시서는 기존 테이블을 12개로 적었지만 저장소에 정의된 모델은 11개다: `users` ·
`user_sessions` · `user_bans` · `user_stats` · `login_history` · `online_presence` ·
`password_reset_tokens` · `account_find_requests` · `traffic_logs` · `friend_requests` ·
`friendships`. 회귀 테스트(`schema.existingTables.test.js`)는 이 11개를 그대로 스냅샷으로
고정하고, 모델 목록에 추가·삭제·이름 충돌이 없는지도 함께 검사한다. 12번째 테이블이 배포
DB에만 있고 모델이 없는 것인지(예: `SequelizeMeta`) 확인이 필요하다.

## 참조가 성립하지 않는 컬럼

| 컬럼 | 문제 |
| --- | --- |
| `online_presence.current_room_id` | `INTEGER`인데 방은 DB 테이블이 아니라 소켓 서버 메모리(`gameRooms`)에만 있고 식별자는 문자열 방 코드다. 참조할 테이블이 없고 타입도 맞지 않는다. 코드에서 읽거나 쓰는 곳도 없다. |
| `user_bans.banned_by` | 운영자를 가리키려는 컬럼이지만 `INTEGER`다. `users`의 기본키는 `uuid`(UUID)라 이 타입으로는 참조가 불가능하고 외래키도 걸려 있지 않다. 코드에서 읽거나 쓰는 곳도 없다. |

두 컬럼 모두 타입을 바꾸면 기존 테이블의 DDL이 바뀌어 "기존 테이블 불변" 조건과 충돌하므로
이번에는 기록만 한다. 고칠 때는 `current_room_id`를 방 코드 문자열로, `banned_by`를 UUID +
`users(uuid)` 외래키로 옮기는 마이그레이션이 필요하다.

## 신규 테이블에 대해 하지 않은 것

`game_results` · `game_result_players` · `concurrent_snapshots`는 **테이블 정의만** 추가했다.
결과 저장이나 동접 집계를 수행하는 서비스·리포지토리·라우트·소켓 핸들러는 이번 슬라이스에서
만들지 않았다. 신규 컬럼의 의미는 다음과 같이 두었다.

- `game_results.winner_team` — `game-core`의 `evaluateWinCondition`이 내는 `'JOKER' | 'CITIZEN'`
- `game_result_players.role` — `roleComposition`의 역할 키(`JOKER` · `CITIZEN` · `DOCTOR` ·
  `GUARD` · `WITCH_HUNTER`)
- `concurrent_snapshots` — 특정 시각의 동접 수치를 한 줄씩 append하는 시계열 테이블

## 스키마 테스트가 확인하는 범위

`config/config.json`은 development·test·production 모두 `mysql`이고 테스트 환경에는 붙을 DB가
없다. 그래서 `backend/__tests__/schema.*.test.js`는 실제 `CREATE TABLE` 결과 대신 `sync`가
DDL을 만들 때 그대로 사용하는 모델 메타데이터(테이블명·컬럼·타입·NOT NULL·외래키 참조·기본키)를
검사한다. 살아 있는 MySQL이 있는 환경에서는 `information_schema` 대조 테스트를 추가하는 것이
다음 단계다.
