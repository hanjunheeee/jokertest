// 입구 객체 이름 잇기 파일, 입구(index.js)의 이름을 원래 파일 내보내기 값으로 읽고 씀
// services/auth의 account·social·signupEmailVerification 입구가 씀 (같은 폴더 파일은 입구 대신 원래 파일 객체로 불러 순환 require 없앰)

// 읽기·쓰기 둘 다 원래 파일 객체로 감 → 시험이 입구에 넣은 가짜가 같은 폴더 안 부르기에도 그대로 먹음
// 예: forwardExports(입구, require('./state'), ['consumeOAuthState']) 뒤 입구.consumeOAuthState = 가짜 → state.consumeOAuthState도 가짜
exports.forwardExports = (target, source, names) => {
    for (const name of names) {
        Object.defineProperty(target, name, {
            enumerable:   true,
            configurable: true,
            get: () => source[name],
            set: (value) => { source[name] = value; },
        });
    }
    return target;
};
