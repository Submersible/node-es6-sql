# es6-sql

__warning: in development, do not use, but do contribute.__

Stop wasting your life with embedded DSLs [1], and just write SQL.

## sql\`SQL...\`

Interpolate scope safely into a SQL statement, using ES6's [tagged template strings](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/template_strings#Tagged_template_strings).

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
        OR user_id IN (${sql`SELECT user_id FROM all_users WHERE is_active = True`})`;
```

## Composition

Easily combine SQL programmatically.

### query.column\`SQL...\`

```javascript
query = query.column`COUNT(id) as total`;
```

### query.join\`SQL...\`

```javascript
query = query.join`
    LEFT JOIN user_tweets ON tweet_id = user_id
        AND tweeted_on > now`;
```

### query.and\`SQL...\`

```javascript
query = query.and`hello = ${123}`
```

### query.or\`SQL...\`

```javascript
query = query.or`foo IN (SELECT foo FROM foo)`;
```

### query.group\`SQL...\`

```javascript
query = query.group`user_id`;
```

### query.having\`SQL...\`

```javascript
query = query.having`COUNT(tweeted.id) > 2`;
```

### query.order\`SQL...\`

```javascript
query = query.order`tweeted_on DESC`;
```

### query.limit(Number)

```javascript
query = query.limit(25);
```

### query.offset(Number)

```javascript
query = query.offset(125);
```

```javascript
function paginate(page, page_size) {
    query = query.limit(page).offset(page * page_size);
}
```

### Composition through Interpolation

```javascript
function queryCount(query) {
    return sql`SELECT count(*) as count FROM (${query}) a`;
}
function queryUnion(a, b) {
    return sql`${a} UNION ${b}`;
}
```

Reuse utilities at hand like `lodash` for assembling our queries.

```javascript
function queryUnionList(query_list) {
    return query_list.reduce(queryUnion, query_list);
}
```

## Serialization

### sql.toString()

Serialize your SQL statement into a string with values interpolated.

```javascript
console.log(query.toString());
```

```sql
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
```

### sql.parameters

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
