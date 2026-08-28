---
approval: plan
setup: npm ci --prefix backend
---

# joker-R1 · 경기 결과 저장 + 전적 집계

## 확정 스펙 (전제 — 두 차례 전수조사 교차 결론 반영)

- 참가자 키: users.uuid 그대로 (게임 player.uuid = 계정 PK, 매핑 불필요. 게스트 없음 → NOT NULL)
- 테이블은 DB3에서 선생성됨 (game_results·game_result_players) — 이 슬라이스는 write·read 코드만
- **저장 시점: phase가 ENDED로 바뀌는 즉시** (참가자 이탈·registry 삭제 이전). 정상 종료는 밤 판정·재판 판정 두 경로에서 발생하므로 **공통 persistence 함수 하나**로 모으고, game_id를 idempotency 키로 써서(PK/UNIQUE) 중복 저장을 방어한다
- **user_stats 갱신 포함**: 결과 본체 + 참가자 행 + user_stats(total_games·survival_count·execution_count·most_played_role)를 **하나의 Sequelize 트랜잭션**으로 묶는다. 기존 6컬럼 범위 안에서만 갱신 (컬럼 추가 금지 — sync 한계)
- **중단 경기(도중 이탈로 세션 종료)**: completed=false로 저장. 이탈자는 won=false·death_reason=DISCONNECT로 패배 기록, 잔류자는 won=null(승패 없음)·user_stats 미반영. ※S3 이후엔 이탈=개별 사망으로 게임이 계속되므로, 완주된 경기의 이탈 사망자는 자기 진영의 자연 결과를 따른다 — 이 규칙은 중단 경기에만 적용
- 저장 실패는 게임 종료 흐름(game_ended 방송·registry 정리)을 절대 막지 않는다 — 독립 try + best-effort + 서버 로그. "메모리는 ENDED인데 저장만 실패"한 부분 성공 상태를 허용한다 (재시도·outbox는 범위 밖)

## 요구

1. 공통 persistence 함수: 세션 객체를 받아 game_results 1행 + game_result_players N행 + 참가자별 user_stats 갱신을 단일 트랜잭션으로 수행. 두 정상 종료 경로와 중단 종료 경로가 전부 이 함수를 호출한다.
2. 필드 채움: winner·win_reason·started_at·ended_at·day_index·player_count·settings(방 설정 스냅샷), 참가자별 nickname_snapshot(세션의 닉네임 그대로)·role·team·won·is_alive·death_reason(EXECUTION/ASSASSINATION/DISCONNECT/null).
3. 같은 game_id 이중 호출 시 두 번째는 무시된다 (idempotency 테스트).
4. 조회 API 1개: 경기 id 단건 조회. 목록·통계·랭킹 API는 범위 밖.
5. 저장 실패 주입 테스트: DB 오류 시에도 game_ended 방송과 세션 정리가 정상 진행된다.

## 성공 조건

- 정상 완주 경기: 결과·참가자·user_stats가 한 트랜잭션으로 저장되고 프로필 조회에 반영된다
- 밤 판정 종료·재판 판정 종료 양쪽 모두 정확히 1회 저장된다
- 중단 경기: completed=false, 이탈자만 패배·stats 반영, 잔류자 won=null·stats 무변화
- 저장 실패 시 게임 종료 연출·정리가 정상 진행된다

## 성공 조건에 넣지 말 것 (범위 밖 — 수정 금지)

- 랭킹·시즌·목록 API, 결과 화면 UI
- 재시도·outbox·백필
- 게임 규칙 로직 (해소·판정 무변경 — 종료 지점에 훅만)

## 자잘한 규칙

- 변경 범위: game-core 종료 확정 지점 훅 + socket 종료 경로 + 저장 계층(repository)
- 선행: DB3(테이블) merge 완료
