exports.seed = function (knex, Promise) {
    // Deletes ALL existing entries
    return knex('user_social_accounts').del()
        .then(function () {
            return knex('user_social_accounts').insert([
                {user_id: 1, facebook_id: 12345, facebook_name: '123465', wechat_openid: '', wechat_unionid: ''},
                {user_id: 2, facebook_id: 123455, facebook_name: '12345', wechat_openid: 12345, wechat_unionid: '12345'}
            ]);
        });
};
