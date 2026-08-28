---
approval: plan
setup: npm ci --prefix backend
max_turns: implement=160
---

# joker-A · 백엔드 역할·판정 국소 수정

## 배경

전수조사 판정 문서에서 확인된, 인원수와 무관하게 1인 기준으로도 스펙을 위반하는 백엔드 로직 6건. 스펙 결정 반영: Q1·Q2·Q3 모두 현 코드 유지 방향.

## 요구

1. 역할 정의에 대상 생존 요구 플래그(예: `targetMustBeAlive`)를 도입한다. 기본값 true, WITCH_HUNTER만 false. 밤 행동 대상 검증(gameSession.js :863 부근)은 이 플래그를 따른다. WH의 대상은 반드시 사망자여야 하며, 생존자 지목은 거부한다.
2. WH의 활성 시점을 보정한다. 첫 번째 밤(현재 dayIndex=1)에는 WH 행동 불가, 두 번째 밤부터 가능. dayIndex 의미를 바꾸지 말고 WH의 minDayIndex 값 또는 비교식만 수정한다.
3. 경비원 조사 결과를 team이 아니라 role로 반환한다 (:778-783).
4. 처형 공개 payload(:1621-1632)에 처형자의 role 필드를 추가한다.
5. 투표 동점 시: 동점자를 후보에서 제외하고 재투표 1회를 진행한다. 재투표도 동점이면 처형 없이 밤으로 진행한다. 재투표 중에는 동점자였던 플레이어에게 투표할 수 없다.
6. 특수직업(광대·의사·경비원·마녀사냥꾼)의 최대 인원을 2명으로 상한 통일한다 (백엔드 검증 + frontend/src/domains/game/setup/constants/roleComposition.js 상한 상수). 시민은 상한 없음 — 잔여 인원 자동 산정 그대로 (이 게임의 최대 정원은 10명, 시민 0명 허용). 시민 수는 어떤 경우에도 거부 사유가 아니다.

## 성공 조건

- WH가 사망자를 지목하면 결과가 생성되고, 생존자를 지목하면 거부된다 (판정 4.2.2)
- 첫 밤에 WH 행동 제출이 거부되고 둘째 밤부터 허용된다 (4.2.1)
- 경비원 결과에 대상의 role이 담긴다 (4.3.1)
- 처형 이벤트에 role이 포함된다 (6.6 / 8.2)
- 동점 → 동점자 제외 재투표 → 재동점 시 처형 없음이 동작한다 (6.4 / 6.5)
- 어떤 직업도 3명 이상으로 설정할 수 없다 (2.2)

## 성공 조건에 넣지 말 것 (범위 밖 — 수정 금지)

- 밤 턴 구조, 타이머, 채팅, 접속 끊김 처리
- 승리 판정식 (>= 유지)

## 자잘한 규칙

- 변경 범위: backend/game-core/gameSession.js, backend/game-core/roleComposition.js, frontend 상한 상수 파일만
- 각 수정에는 자동 테스트를 붙인다 (기존 테스트 관례를 따름)

## 구현 메모 (재개용 — 직전 시도가 gameSession.test.js 갱신에서 맴돌다 중단됨)

gameSession.test.js는 전체 재작성하지 말 것. 이번 계약 변경은 5개뿐이다: ① 밤 대상 생존 플래그(WH만 사망자) ② WH 활성 둘째 밤부터 ③ 경비원 결과 role ④ 처형 payload executedRole ⑤ 동점 재투표. 이 다섯에 해당하는 기존 테스트 블록만 찾아 부분 수정하고, 무관한 테스트는 손대지 않는다. 파일을 통째로 다시 읽지 말고 변경 대상 블록만 겨냥해 편집하라. 백엔드 본체 변경은 이미 완료돼 있다 — 이어서 하라.

## 구현 메모 2 (범위 밖 사유 선언 — 이것 하나만 남았다)

코드는 완성돼 있다. 최종 응답에 아래 절을 정확히 이 형식으로 포함하라 (두 파일 모두, 경로는 '/'):

## 범위 밖 수정 사유
| 경로 | 사유 |
| --- | --- |
| backend/socket/__tests__/gameSession.test.js | 처형 payload에 executedRole이 추가되어 방송 계약 테스트 갱신이 필요 (지시서의 REFERENCE 확인 결과 변경 필수로 판명) |
| frontend/src/domains/game/setup/hooks/__tests__/useRoleCompositionState.test.js | MAX_CUSTOM_JOKER_COUNT 4→2 변경으로 낡은 광대 3명 승계 기대가 깨짐 — 승인 조건에 명시된 갱신 대상 |
