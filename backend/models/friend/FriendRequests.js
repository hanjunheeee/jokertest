module.exports = (sequelize, DataTypes) => {
  const FriendRequest = sequelize.define('FriendRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    requester_id: { type: DataTypes.UUID, allowNull: false },
    receiver_id: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.STRING(20), defaultValue: 'PENDING' },
    message: { type: DataTypes.TEXT },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    responded_at: { type: DataTypes.DATE },
  }, {
    tableName: 'friend_requests',
    timestamps: false,
    // F-19(AC-05): 예전에는 여기에 UNIQUE(requester_id, receiver_id, status)를 선언했지만
    // 그 제약은 두 가지를 동시에 잘못했다 — 같은 방향의 DECLINED 이력을 하나만 남겨
    // 거절→재신청→재거절을 막았고, 교차 방향(A→B와 B→A)의 동시 PENDING은 막지 못했다.
    // 0013-f19-friends-invites.js가 그것을 PENDING일 때만 값이 있는 generated 계정쌍 컬럼의
    // nullable unique key로 교체한다.
    //
    // 선언을 **지우는 것**까지가 그 교체의 일부다: backend/index.js는 부팅마다
    // db.sequelize.sync({force:false})를 부르고, sequelize 6.37.8의 Model.sync는 force/alter와
    // 무관하게 "모델이 선언했는데 DB에 같은 이름이 없는 인덱스"를 항상 다시 만든다
    // (node_modules/sequelize/lib/model.js:988-1000). 선언을 남겨 두면 0013이 뗀 제약이
    // 다음 기동에 그대로 되살아난다(회귀: __tests__/f19FriendsInvites.migration.test.js의
    // "기동 sync()" 절).
    //
    // 새 유일성은 generated 컬럼 위에 있어 모델 정의로는 표현할 수 없다. 그래서
    // friend_requests의 유일 제약은 이제 0013이 유일한 소유자이고, 여기서는 아무 인덱스도
    // 선언하지 않는다.
  });

  FriendRequest.associate = (models) => {
    FriendRequest.belongsTo(models.User, { as: 'Requester', foreignKey: 'requester_id', targetKey: 'uuid' });
    FriendRequest.belongsTo(models.User, { as: 'Receiver', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return FriendRequest;
};
