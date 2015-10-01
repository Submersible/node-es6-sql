'use strict';

var test = require('tap').test;
var sql = require('./');
var SqlParser = require('sql-parser');
var Immutable = require('immutable');
var dedent = require('deindent');

/**
 * ```markdown
 * # @TODO
 *
 * * handle `IN ${x}` correctly
 * * allow JSON querying with Postgres
 * * test the most complex query with everything interpolated with every possible value
 *     * integer
 *     * string
 *     * table name
 *     * arrays
 *     * ... ?
 * * test that weird stuff like functions or objects don't work.
 * ```
 */

function stripBacktick(s) {
    return s.replace(/`/g, '').trim();
}

test('readme', function (t) {
    var table = 'interp_user_table',
        user_id = 100;

    var query = sql`
        SELECT *
        FROM ${table}
        WHERE
            user_id = ${user_id}
            OR user_id IN (1,2,3)
            OR user_id IN (${sql`SELECT user_id FROM all_users WHERE is_active = True`})`;

    query = query.column`COUNT(id) as total`;
    query = query.join`
        LEFT JOIN user_tweets ON tweet_id = user_id
            AND tweeted_on > now`;
    query = query.and`hello = ${123}`
    query = query.or`foo IN (SELECT foo FROM foo)`;
    query = query.group`user_id`;
    query = query.having`COUNT(tweeted_id) > 2`;
    query = query.order`tweeted_on DESC`;
    query = query.limit(25);
    query = query.offset(125);

    t.equal(stripBacktick(query.toString()), dedent`
        SELECT *, COUNT(id) AS total
          FROM interp_user_table
          LEFT JOIN user_tweets
            ON ((tweet_id = user_id) AND (tweeted_on > now))
          WHERE (((((user_id = $1) OR (user_id IN (1, 2, 3))) OR (user_id IN (SELECT user_id
            FROM all_users
            WHERE (is_active = TRUE)))) AND (hello = $2)) OR (foo IN (
            SELECT foo
              FROM foo
          )))
          GROUP BY user_id
          HAVING (COUNT(tweeted_id) > 2)
          ORDER BY tweeted_on DESC
          LIMIT 25
          OFFSET 125
    `.trim());
    t.deepEqual(query.parameters.toArray(), [100, 123]);
    t.end();
});

test('sql', function (t) {
    var table = 'interp_user_table',
        user_id = 100;

    var query = sql`
        SELECT *
        FROM ${table}
        WHERE
            user_id = ${user_id}
            OR user_id IN (1,2,3)
            OR user_id IN (${sql`SELECT user_id FROM all_users WHERE is_active = True`})`
        .column`COUNT(id) AS hello, face AS ${'meow'}`
        .join`LEFT JOIN meowface ON a = 123`
        .group`my_field, other_field`
        .having`COUNT(id) > 10 AND x = y`
        .order`x DESC, b, c ASC`
        .and`hello = ${123}`
        .limit(10)
        .offset(100)
        .or`foo IN (SELECT foo FROM foo)`;
    t.equal(stripBacktick(query.toString()), dedent`
        SELECT *, COUNT(id) AS hello,face AS meow
          FROM interp_user_table
          LEFT JOIN meowface
            ON (a = 123)
          WHERE (((((user_id = $1) OR (user_id IN (1, 2, 3))) OR (user_id IN (SELECT user_id
            FROM all_users
            WHERE (is_active = TRUE)))) AND (hello = $2)) OR (foo IN (
            SELECT foo
              FROM foo
          )))
          GROUP BY my_field,other_field
          HAVING ((COUNT(id) > 10) AND (x = y))
          ORDER BY x DESC,b ASC,c ASC
          LIMIT 10
          OFFSET 100
    `.trim());
    t.deepEqual(query.parameters.toArray(), [100, 123]);
    t.end();
});

test('ast', (t) => {
    test('parse', (t) => {
        t.equal(stripBacktick(sql.ast.parse`
            SELECT * FROM ${'hey'} ${'hey'} WHERE a = ${123}
        `.toString()), dedent`
            SELECT *
              FROM __interpolation_0 AS __interpolation_1
              WHERE (a = __interpolation_2)
        `.trim());
        t.end();
    });

    test('rawSQL', (t) => {
        var inner = sql.ast.rawSQL`SELECT * FROM c WHERE x = ${'sup'}`;
        t.equal(stripBacktick(inner.ast.toString()), dedent`
            SELECT *
              FROM c
              WHERE (x = $1)
        `.trim());
        t.deepEqual(inner.parameters.toArray(), ['sup']);
        var ret = sql.ast.rawSQL`
            SELECT * FROM ${'hey'} ${'hey'}
            WHERE a = ${123} AND x IN (${inner})
        `;
        t.equal(stripBacktick(ret.ast.toString()), dedent`
            SELECT *
              FROM hey AS hey
              WHERE ((a = $1) AND (x IN (SELECT *
                FROM c
                WHERE (x = $2))))
        `.trim());
        t.deepEqual(ret.parameters.toArray(), [123, 'sup']);
        t.end();
    });

    test('rawExpression', (t) => {
        var where = sql.ast.rawExpression`x = ${'foo'} AND ${1} = ${1}`;
        t.equal(stripBacktick(where.ast.toString()), dedent`
            ((x = $1) AND ($2 = $2))
        `.trim());
        t.deepEqual(where.parameters.toArray(), ['foo', 1]);
        t.end();
    });

    test('merging parameters', (t) => {
        var a_ast = SqlParser.parse('SELECT * FROM a WHERE a = $1 AND (b = $2 OR c = $3)'),
            a_parameters = new Immutable.List([1, [3, 4, 5], 'hey']),
            b_ast = SqlParser.parse('SELECT * FROM b WHERE a = $1 OR (b = $2 AND c = $3)'),
            b_parameters = new Immutable.List(['hey', 1, 66]);

        var ret = sql.ast.mergeVariables(a_parameters, {ast: b_ast, parameters: b_parameters});

        t.deepEqual(ret.parameters.toArray(), [1, [3, 4, 5], 'hey', 66]);
        t.equal(stripBacktick(ret.ast.toString()), dedent`
            SELECT *
              FROM b
              WHERE ((a = $3) OR ((b = $1) AND (c = $4)))
        `.trim());
        t.end();
    });
    t.end();
});
