'use strict';

var _ = require('lodash'),
    Immutable = require('immutable'),
    SqlParser = require('sql-parser'),
    assert = require('assert');

console.error('es6-sql: WARNING DO NOT USE THIS IN PRODUCTION!');

function sql(parts) {
    var statement = sql.ast.rawSQL.apply(this, arguments);

    return new SQL(statement.ast, statement.parameters);
}

var whereProp = _.property('where.conditions'),
    groupProp = _.property('group.fields'),
    havingProp = _.property('group.having.conditions'),
    orderProp = _.property('order.orderings'),
    orderOffsetProp = _.property('order.offset'),
    limitProp = _.property('limit.value'),
    offsetProp = _.property('limit.offset');

class SQL {
    constructor(ast, parameters) {
        this.ast = ast;
        this.parameters = new Immutable.List(parameters);
    }
    limit(n) {
        assert(_.isNumber(n), 'Limit must be a number.');
        var new_ast = Object.create(this.ast);
        new_ast.limit = new SqlParser.nodes.Limit(
            new SqlParser.nodes.LiteralValue(n),
            offsetProp(this.ast)
        );
        return new SQL(new_ast, this.parameters);
    }
    offset(n) {
        assert(_.isNumber(n), 'Offset must be a number.');
        var new_ast = Object.create(this.ast);
        new_ast.limit = new SqlParser.nodes.Limit(
            limitProp(this.ast),
            new SqlParser.nodes.LiteralValue(n)
        );
        return new SQL(new_ast, this.parameters);
    }
    toString() {
        return this.ast.toString();
    }
}

SQL.prototype.column = compositionHandler({
    wrap: surround('SELECT ', ' FROM noop'),
    merge: (acc, ast) => { acc.fields = acc.fields.concat(ast.fields); }
});
SQL.prototype.and = expressionHandler('AND');
SQL.prototype.or = expressionHandler('OR');
SQL.prototype.join = compositionHandler({
    wrap: prefix('SELECT noop FROM noop '),
    merge: (acc, ast) => { acc.joins = acc.joins.concat(ast.joins); }
});
SQL.prototype.group = compositionHandler({
    wrap: prefix('SELECT noop FROM noop GROUP BY '),
    merge: (acc, ast) => {
        acc.group = new SqlParser.nodes.Group(
            (groupProp(acc) || []).concat(groupProp(ast))
        );
        acc.group.having = havingProp(acc);
    }
});
SQL.prototype.having = compositionHandler({
    wrap: prefix('SELECT noop FROM noop GROUP BY noop HAVING '),
    merge: (acc, ast) => {
        acc.group = new SqlParser.nodes.Group(groupProp(acc));
        acc.group.having = new SqlParser.nodes.Having(mergeOp(
            'AND', havingProp(acc), havingProp(ast)
        ));
    }
});
SQL.prototype.order = compositionHandler({
    wrap: prefix('SELECT noop FROM noop ORDER BY '),
    merge: (acc, ast) => {
        acc.order = new SqlParser.nodes.Order(
            (orderProp(acc) || []).concat(orderProp(ast)),
            orderOffsetProp(acc)
        );
    }
});

function compositionHandler(options) {
    return function (code) {
        code = options.wrap(code);
        var ret = sql.ast.rawSQL.apply(null, [code].concat(_.toArray(arguments).slice(1)));
        ret = sql.ast.mergeVariables(this.parameters, {ast: ret.ast, parameters: ret.parameters});

        var new_ast = Object.create(this.ast);
        options.merge(new_ast, ret.ast);
        return new SQL(new_ast, ret.parameters);
    }
}

function expressionHandler(condition) {
    return compositionHandler({
        wrap: prefix('SELECT noop FROM noop WHERE '),
        merge: (acc, ast) => {
            acc.where = new SqlParser.nodes.Where(mergeOp(
                condition, whereProp(acc), whereProp(ast)
            ));
        }
    });
}

function mergeOp(condition, a, b) {
    if (!a) {
        return b;
    }
    if (!b) {
        return a;
    }
    return new SqlParser.nodes.Op(condition, a, b);
}

function prefix(sql) {
    return (parts) => [sql + parts[0]].concat(_.toArray(parts).slice(1));
}

function postfix(sql) {
    return (parts) => parts.slice(0, -1).concat([_.last(parts) + sql]);
}

function surround(a, b) {
    return _.compose(prefix(a), postfix(b));
}

sql.SQL = SQL;
sql.ast = require('./ast');
module.exports = sql;
