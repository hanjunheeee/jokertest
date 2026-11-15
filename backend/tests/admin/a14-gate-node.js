'use strict';

// 두 번째 서버(Node) 흉내 파일, 따로 뜬 프로세스에서 관리자 시험 서버를 열고 주소를 부모에게 보냄
// a14-login-lock 시험(A14-B-127)이 fork로 띄움: 같은 시험 DB·환경값을 물려받고 메모리는 따로라 "서버 두 대"와 같음
const { startAdminServer } = require('./helpers/adminTestApp');

startAdminServer().then(({ url }) => {
    process.send({ url });
}, (error) => {
    process.send({ error: String(error?.message ?? error) });
    process.exit(1);
});

// 부모가 끝나면 같이 끝남
process.on('disconnect', () => process.exit(0));
