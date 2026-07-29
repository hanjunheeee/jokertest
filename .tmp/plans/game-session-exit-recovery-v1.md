# GameSession 종료 및 새 방 재진입 복구

## 기준점

- 브랜치: `game-session-exit-recovery`
- 기준 커밋: `29ab080`
- 현재 정책상 참가자 한 명의 Socket disconnect는 전체 GameSession을 즉시 종료한다.
- 브라우저 수동 테스트에서 한 계정이 인게임 화면에서 뒤로 가면 모든 참가자의
  프런트는 게임 종료 상태가 되지만 이후 새 방 생성 흐름이 정상적으로 동작하지 않았다.

## 목표

한 참가자가 인게임에서 명시적으로 이탈하거나 연결이 끊기면 전체 GameSession을
정확히 한 번 종료하고 관련 서버·Socket·프런트 상태를 완전히 정리한다. 종료된 모든
사용자는 로비에서 새 방을 직접 생성하거나 다른 방에 즉시 참가할 수 있어야 한다.

## 확정 정책

- 한 참가자의 이탈 또는 disconnect는 전체 게임을 즉시 종료한다.
- 모든 참가자는 일반 로비로 돌아간다.
- 이전 대기방을 자동으로 복원하거나 기존 참가자를 자동 재결합하지 않는다.
- 사용자는 종료 직후 새 방을 직접 만들거나 참가한다.
- 명시적 이탈과 disconnect는 같은 core 종료 계약을 공유한다.
- 명시적 이탈 직후 뒤늦게 도착한 disconnect는 멱등한 no-op이어야 한다.
- 이전 세션의 늦은 종료 요청이 같은 사용자가 참여한 새 세션을 종료하면 안 된다.

## 먼저 확인할 실제 원인

현재 코드를 읽어 다음 상태가 게임 시작·종료 과정에서 어떻게 변하는지 추적한다.

- GameSession registry
- player-to-session registry
- room-to-session registry
- matchmaking의 `gameRooms`
- matchmaking의 `playerRoom`
- matchmaking queue
- Socket.IO GameSession channel과 대기방 channel
- 프런트 ingame store와 로비/방 store
- `game_ended` 수신 후 라우팅과 상태 초기화

추측으로 새 정리 코드를 중복 추가하지 말고, 새 방 생성을 막는 실제 잔존 상태를
테스트로 먼저 고정한다.

## 서버 계약

### 명시적 이탈

필요하다면 인증된 Socket 이벤트를 추가한다.

```text
leave_game_session
payload: { gameId }
ack success: { ok: true }
ack failure: 기존 정규화된 { ok: false, code, message } 계약
```

- UUID는 payload에서 받지 않고 `socket.data.user.uuid`만 사용한다.
- 요청 gameId는 타입과 trim을 검증한다.
- 실제 registry의 canonical session ID와 일치해야 한다.
- payload의 roomId, role, team, nickname 등은 신뢰하지 않는다.
- callback 존재 여부 및 payload 검증 순서는 기존 Socket 계약과 일치시킨다.
- 성공 및 이미 동일 세션이 종료된 경쟁 상황을 안전하게 멱등 처리한다.

### 세션 종료

- GameSession 관련 registry를 참가자 전원 기준으로 정리한다.
- 새 방 생성·참가를 막는 matchmaking 소유 상태를 실제 책임 경계에 맞춰 정리한다.
- 참가자 Socket을 종료된 GameSession channel에서 제거한다.
- 참가자 전체에 `game_ended`를 정확히 한 번 전달한다.
- 알림 emit 또는 channel 정리가 실패해도 registry 정리는 완료한다.
- 정리 이후 동일 사용자의 새 방 생성과 참가가 즉시 가능해야 한다.
- 종료된 세션 A의 늦은 요청이 새 세션 B를 건드리지 않도록 canonical gameId로
  ABA를 방지한다.

### disconnect

- 기존 disconnect 즉시 전체 종료 정책을 유지한다.
- 명시적 이탈과 동일한 종료 core를 호출한다.
- 명시적 이탈과 disconnect가 연속 또는 중첩되어도 종료·방송은 한 번뿐이다.
- 이미 종료된 사용자의 disconnect는 조용한 no-op이다.

## 프런트 계약

- 인게임에서 애플리케이션 내부 뒤로가기나 명시적 나가기 시 현재 Socket으로
  `leave_game_session`을 전달한다.
- 성공 ack를 받은 뒤 로비로 이동하는 것을 기본으로 한다.
- timeout·Socket 종료 경쟁에서도 로컬 상태가 과거 게임으로 복구되지 않는다.
- 서버의 `game_ended`가 먼저 도착해도 동일하게 한 번만 초기화하고 로비로 이동한다.
- 다른 참가자도 `game_ended` 수신 후 인게임 상태를 비우고 로비로 이동한다.
- 이전 gameId의 늦은 ack/event가 새 방 또는 새 게임 상태를 지우지 않는다.
- 실제 브라우저 탭 종료처럼 ack를 기다릴 수 없는 경우 disconnect 종료가 fallback이다.
- 기존 조커 채팅, 밤 행동, 역할 정보의 listener cleanup을 회귀시키지 않는다.

## 자동 테스트

### Core

- 참가자 한 명 종료 시 참가자 전원의 GameSession registry 정리
- 반복 종료 멱등성
- 세션 A 종료 후 세션 B 생성 가능
- 세션 A의 늦은 종료 요청이 세션 B에 영향 없음
- 잘못된 gameId와 registry 불일치에서 상태 불변

### Socket

- 인증 UUID만 사용하는 명시적 이탈
- payload UUID/role/team/roomId 위조 무시 또는 거부
- 성공 ack와 canonical gameId 사용
- `game_ended` 정확히 한 번
- 명시적 이탈과 disconnect 중첩 시 정확히 한 번
- callback throw, broadcast throw, channel cleanup throw 격리
- raw Error/message/stack과 비밀 역할 정보 로그 비노출
- 종료 직후 참가자별 새 방 생성 가능
- 종료 직후 새 방 코드 참가 가능
- 다른 활성 세션에 영향 없음

### Frontend

- 현재 gameId 요청만 종료 결과를 반영
- 늦은 이전 요청 ack 무시
- `game_ended`와 명시적 이탈 ack 경쟁에서 초기화 한 번
- gameId 변경·Socket 교체·disconnect·unmount 방어
- 로비 전환 후 인게임 store 초기화

### 전체 검증

- backend 전체 테스트
- frontend 전체 테스트
- frontend production build
- `git diff --check`

## 브라우저 테스트

1. 4개 계정으로 게임을 시작하고 NIGHT까지 진입한다.
2. 한 계정에서 애플리케이션 뒤로가기 또는 나가기를 실행한다.
3. 네 계정 모두 로비로 이동하고 동일 게임 화면이 남지 않는지 확인한다.
4. 종료 방송이나 오류 메시지가 중복 표시되지 않는지 확인한다.
5. 기존 방이 자동 복원되지 않는지 확인한다.
6. 이전 방장 계정이 새 방을 직접 생성한다.
7. 나머지 세 계정이 새 방에 정상 참가한다.
8. 새 방에서 ready 및 게임 시작이 정상 동작하는지 확인한다.
9. 새 게임 시작 후 이전 gameId의 늦은 event가 새 게임을 종료하지 않는지 확인한다.
10. 별도 새 게임에서 브라우저 탭 하나를 닫아 disconnect fallback도 같은 결과인지
    마지막에 확인한다.

## 완료 조건

- 명시적 이탈과 disconnect 모두 전체 GameSession을 정확히 한 번 종료한다.
- 관련 서버 registry와 Socket channel에 종료된 세션 상태가 남지 않는다.
- 모든 참가자가 로비로 이동하고 인게임 상태가 초기화된다.
- 종료 직후 새 방 생성·참가·ready·게임 시작이 가능하다.
- 이전 세션의 늦은 종료가 새 세션에 영향을 주지 않는다.
- 기존 조커 채팅과 NIGHT 행동 계약이 회귀하지 않는다.
- 전체 테스트와 build가 통과한다.
- stage·commit·push는 자동화하지 않는다.

## 범위 제외

- 이전 대기방 자동 복원
- 재접속 유예와 세션 재개
- Redis 또는 다중 서버 분산 상태
- 게임 결과·승패 판정
- 투표 집계·밤 결과·사망·NIGHT→DAY
- DB 영속화
