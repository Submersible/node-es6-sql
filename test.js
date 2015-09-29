'use strict';

var test = require('tap').test;
var sql = require('./');

test('readme', function (t) {
    var table = 'interp_user_table',
        user_id = 100;

    var query = sql`
        SELECT *
        FROM ${table}
        WHERE
            user_id = ${user_id}
            OR user_id IN (1,2,3)
            OR user_id IN (${sql`SELECT user_id FROM all_users WHERE is_active = True`})`
        .and`hello = ${123}`
        .or`foo IN (SELECT foo FROM foo)`;

    t.equal(query.toString(), [
        'SELECT *',
        '  FROM `interp_user_table`',
        '  WHERE (((((`user_id` = `$1`) OR (`user_id` IN (1, 2, 3))) OR (`user_id` IN (`SELECT `user_id`',
        '    FROM `all_users`',
        '    WHERE (`is_active` = TRUE)`))) AND (`hello` = `$2`)) OR (`foo` IN (',
        '    SELECT `foo`',
        '      FROM `foo`',
        '  )))',
    ].join('\n'));
    // console.log(query.toString());
    t.equal(query.parameters, [100, 123]);
})
