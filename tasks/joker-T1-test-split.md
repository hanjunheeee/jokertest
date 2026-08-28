---
approval: plan
setup: npm ci --prefix backend
max_turns: implement=160
---

# joker-T1 · gameSession 테스트 파일 분할 (순수 이동)

## 배경

backend/game-core/__tests__/gameSession.test.js가 게임 전체 계약을 한 파일에 담은 거대 파일이라, 이 파일을 갱신하는 모든 슬라이스에서 반복 재읽기 병리가 발생했다 (3회 실측). 다음 슬라이스(S1-1)가 이 파일을 가장 크게 수술하므로, 그 전에 칸을 나눈다.

## 요구

1. backend/game-core/__tests__/gameSession.test.js를 아래 6파일로 분할한다 (같은 디렉터리):
   - gameSession.session.test.js — 세션 생성·참가·commit·수명·스냅샷 구조
   - gameSession.nightActions.test.js — 밤 행동 제출·검증 (대상 생존 플래그·WH 첫밤 등)
   - gameSession.nightResolution.test.js — 밤 해소 (보호·사망·통지·순서)
   - gameSession.dayVote.test.js — 낮 토론/ready/투표/재투표/기권/처형
   - gameSession.roles.test.js — 역할 구성·상한·배정 관련 (roleComposition.test.js와 중복되는 건 두지 말 것 — 세션 쪽 계약만)
   - gameSession.winCondition.test.js — 승리 판정·재평가·게임 종료
2. **순수 이동이다**: 테스트 로직·기대값·이름을 바꾸지 않는다. 각 테스트 블록을 통째로 옮기기만 한다. 공용 헬퍼(세션 생성·페이즈 전진 등)는 gameSession.testUtils.js 한 파일로 추출해 6파일이 공유한다 — 헬퍼도 로직 무변경, 위치만 이동.
3. 분할 후 원본 gameSession.test.js는 삭제한다.
4. 어느 파일에 넣을지 애매한 테스트는 가장 가까운 주제 파일에 넣고 계획에서 배치를 선언한다 — 정답보다 선언이 중요하다.

## 성공 조건

- 전체 테스트 수가 분할 전과 동일하다 (누락·중복 0 — 분할 전후 테스트 개수를 세어 비교)
- 전 테스트 통과 (분할 전에도 통과했으므로 동일해야 함)
- 원본 파일 부재, 새 6+1파일 존재
- 프로덕션 코드 무변경 (backend/frontend 소스 파일 MODIFY 금지)

## 성공 조건에 넣지 말 것 (범위 밖 — 수정 금지)

- 테스트 로직·기대값 개선 (틀린 것처럼 보여도 그대로 이동 — 고치는 건 다른 슬라이스 몫)
- 프로덕션 코드 리팩토링
- socket 쪽 테스트 파일 (backend/socket/__tests__/* 은 건드리지 않음)

## 자잘한 규칙

- 이동하는 김에 각 새 파일 상단에 한 줄 주석: 이 파일이 다루는 계약 범위
- describe 블록 구조는 유지 (파일이 바뀌어도 테스트 이름 검색이 되게)
