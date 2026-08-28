---
approval: plan
setup: npm ci --prefix backend
---

# joker-DB3 · 결과·집계 테이블 선생성 + 고아 자산 정리

## 배경 (전수조사 1.4·1.5·1.7·4.2)

R1(경기 결과)·M1(동접 집계)이 쓸 테이블을 미리 만든다. sync({force:false})는 기존 테이블에 컬럼을 추가하지 못하므로 **필요 컬럼을 지금 전부 담는 것이 핵심**이다. 함께: 과거 게임 저장소 삭제(커밋 4753634)가 남긴 고아 자산을 정리한다.

## 요구

1. 신규 모델 3개를 기존 모델 컨벤션(user.model.js 스타일)에 맞춰 추가한다. 스키마는 아래를 그대로 따른다 (컬럼 가감 금지 — 부족분은 수동 ALTER가 강제되므로):
   - `game_results`: id(UUID PK), room_id(UUID null), started_at, ended_at, winner(STRING20), win_reason(STRING40 null), day_index(INT), player_count(INT), settings(JSON null), completed(BOOL default true — 도중 이탈로 중단된 경기는 false)
   - `game_result_players`: game_id(UUID PK), user_id(UUID PK, FK→users.uuid NOT NULL), nickname_snapshot(STRING30), role(STRING20), team(STRING20), won(BOOL null 허용 — 중단 경기의 잔류자는 승패 없음), is_alive(BOOL), death_reason(STRING20 null)
   - `concurrent_snapshots`: id(BIGINT AI PK), captured_at(DATE, 인덱스), total(INT), lobby(INT), in_game(INT), room_count(INT)
2. 이 슬라이스는 **테이블 생성까지만** — write·read 코드를 넣지 않는다 (R1·M1 소관). 모델 정의·관계(associate)·sync 생성 확인 테스트만.
3. 고아 자산 정리: backend/data/game.sqlite 삭제, package.json의 sqlite3 의존성 제거, .sequelizerc의 존재하지 않는 경로·db:migrate 스크립트·game:harness 스크립트 정리 (삭제 또는 부재 안내로 교체 — 계획이 1안).
4. 미사용 테이블 4개(password_reset_tokens·account_find_requests·traffic_logs)와 타입 어긋난 컬럼(online_presence.current_room_id INTEGER, user_bans.banned_by INTEGER)은 **건드리지 않는다** — 기록만 남기고 범위 밖 (기존 테이블 변경은 sync로 불가, 별도 판단 필요).

## 성공 조건

- 재기동 후 신규 테이블 3개가 정확한 스키마로 존재한다 (테스트가 모델 정의 검증)
- game_result_players.user_id가 users.uuid를 참조하고 NOT NULL이다
- sqlite 고아 자산이 저장소에서 사라지고 npm ci가 여전히 성공한다
- 기존 12개 테이블·기존 동작 무변경

## 성공 조건에 넣지 말 것 (범위 밖 — 수정 금지)

- 결과 저장 write 코드 (R1), 동접 집계 코드 (M1)
- 기존 테이블의 컬럼 변경·삭제
