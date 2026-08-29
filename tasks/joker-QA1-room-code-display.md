# Joker QA1 — 방 코드 표시·복사 계약 복구

## 배경

실제 브라우저 E2E에서 방 생성은 성공하고 별도 인증 소켓의 `room_joined.roomCode`에는 영숫자 6자리 코드가 존재하지만, 방장 대기 화면의 `초대코드 공유` 모달 6칸은 모두 빈 문자열로 렌더링됐다.

## 재현

1. 로그인 후 `게임플레이 → 방 찾기 → 방 만들기`로 기본 10인 방을 만든다.
2. `/game-matching`에서 `초대코드 공유` 모달을 연다.
3. `방 코드 1번째 자리`~`6번째 자리`의 DOM value와 `방코드 복사` 결과를 확인한다.
4. 같은 방에 별도 인증 소켓으로 참가하면 서버 payload에는 정상 `roomCode`가 있다.

## 요구사항

- `create_room`, ack 유실 복구용 `get_current_room`, 코드/공개방 참가의 모든 성공 payload에서 canonical `roomCode`가 `useMatchingStore`에 그대로 보존되어야 한다.
- `RoomCodeViewModal`은 서버가 준 영숫자 6자리 코드를 각 칸에 한 글자씩 표시해야 한다.
- `방코드 복사`는 화면에 표시된 정확한 6자리 코드를 복사해야 하며 빈 문자열을 성공으로 표시하면 안 된다.
- 코드 참가 입력은 서버가 생성하는 형식(영문 대문자와 숫자 6자리)을 입력·붙여넣기·삭제할 수 있어야 한다. 숫자만 남기는 정규화는 금지한다.
- 값이 없거나 6자리가 아닌 경우 공유 모달에서 복사 성공 상태를 보여주지 말고 접근 가능한 안내를 제공해야 한다.
- 방 코드 자체, 인증 토큰, 비밀번호를 로그에 남기지 않는다.

## 성공 조건

- 방 생성 직후 공유 모달 6칸 DOM value를 합치면 서버 응답 `roomCode`와 정확히 같다.
- `get_current_room` 복구 후에도 동일하다.
- 코드 참가 입력에서 `JZJCZ3` 같은 영숫자 코드를 타이핑·붙여넣기할 수 있고 서버 전송 값이 보존된다.
- 기존 숫자 입력, Backspace, 좌우 이동, 자동 포커스 동작이 회귀하지 않는다.
- 컴포넌트/훅/store 단위 테스트와 관련 프론트 전체 테스트 및 production build가 통과한다.

## 예상 범위

- `frontend/src/domains/game/mode/components/RoomCodeInput.jsx`
- `frontend/src/domains/game/mode/hooks/useRoomCodeInput.js`
- `frontend/src/domains/game/matching/components/RoomCodeViewModal.jsx`
- `frontend/src/domains/game/setup/hooks/useGameSetupPage.js`
- `frontend/src/domains/game/matching/store/matchingStore.js`
- 관련 테스트 파일

필요한 범위만 변경하고 backend schema/migration은 변경하지 않는다.
