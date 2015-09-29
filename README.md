# es6-sql

__warning: in development, do not use, but do contribute 😺__

Stop wasting your life with embedded DSLs [1], and just write SQL.

## sql\`SQL...\`

Interpolate scope safely into SQL statement.

```javascript
var sql = require('es6-sql');

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
```

## sql.and\`SQL...\`

## sql.or\`SQL...\`

Compose your SQL filters using AND.

## sql.toString()

Serialize your SQL statement into a string with values interpolated.

```javascript
console.log(query.toString());
```

```sql
SELECT *
  FROM `interp_user_table`
  WHERE (((((`user_id` = `$1`) OR (`user_id` IN (1, 2, 3))) OR (`user_id` IN (`SELECT `user_id`
    FROM `all_users`
    WHERE (`is_active` = TRUE)`))) AND (`hello` = `$2`)) OR (`foo` IN (
    SELECT `foo`
      FROM `foo`
  )))
```

## sql.parameters

```javascript
console.log(query.parameters);
```

```javascript
[100, 123]
```

----------
[1]
* http://www.sqlalchemy.org/
* https://docs.djangoproject.com/en/1.8/topics/db/queries/
* http://www.rubydoc.info/gems/activerecord/4.2.4
* http://datamapper.org/
* http://sequel.jeremyevans.net/
* https://hackage.haskell.org/package/esqueleto
* https://hackage.haskell.org/package/haskelldb
* http://docs.sequelizejs.com/en/latest/
* http://dresende.github.io/node-orm2/
* https://github.com/1602/jugglingdb
* http://propelorm.org/
* http://stainless-steel.github.io/sql/sql/index.html
