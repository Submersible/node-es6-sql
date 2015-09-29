'use strict';

console.error('es6-sql: WARNING DO NOT USE THIS IN PRODUCTION!');

var _ = require('lodash'),
    SqlParser = require('sql-parser');

function interpolateTable(ast, options) {
    if (ast instanceof SqlParser.nodes.Table) {
        return new SqlParser.nodes.Table(
            interpolateTable(ast.name, options),
            interpolateTable(ast.alias, options),
            interpolate(ast.win, options),
            interpolate(ast.winFn, options),
            interpolate(ast.winArg, options)
        );
    }
    if (ast instanceof SqlParser.nodes.LiteralValue) {
        if (ast.value instanceof SqlParser.nodes.LiteralValue) {
            return new SqlParser.nodes.Table(
                interpolateTable(ast, options),
                interpolate(ast.value2, options)
            );
            return interpolateTable(ast, options);
        }
        return new SqlParser.nodes.LiteralValue(options.interpolateInline(ast.value));
    }
    return ast;
}

function interpolate(ast, options) {
    if (!_.isObject(ast)) {
        return ast;
    }
    if (ast instanceof SqlParser.nodes.LiteralValue) {
        if (ast.value instanceof SqlParser.nodes.LiteralValue) {
            return new SqlParser.nodes.Table(
                interpolateTable(ast, options),
                interpolate(ast.value2, options)
            );
            return interpolateTable(ast, options);
        }
        return new SqlParser.nodes.LiteralValue(options.interpolateParameter(ast.value));
    }
    if (ast instanceof SqlParser.nodes.Table) {
        return interpolateTable(ast, options);
    }
    var new_ast = Object.create(ast);

    _.each(ast, (value, key) => {
        new_ast[key] = interpolate(value, options);
    });

    return new_ast;
}

function sql(parts) {
    var parameters = _.toArray(arguments).slice(1);

    /* parse AST with interpolation place holders */
    var code = _.reduce(
        parts, (acc, x, index) => acc.concat([x, '__interpolation_' + index]), []
    ).slice(0, -1).join('');

    /* setup maps for efficient lookup */
    var interpolate_map = new Map(),
        parameters_used = [],
        parameters_used_map = new Map();

    function handleInterpolate(handler) {
        return (s) => interpolate_map.has(s) ? handler(s, interpolate_map.get(s)) : s;
    }

    _.each(parameters, (value, index) => {
        interpolate_map.set(`__interpolation_${index}`, value);
    })

    /* interpolate escaped values into the AST */
    var ast = interpolate(SqlParser.parse(code), {
        interpolateInline: handleInterpolate((s, value) => {
            if (!/^[A-Za-z0-9_ ]+$/.test(value)) {
                throw Error(`Invalid table name ${value}`);
            }
            return value;
        }),
        interpolateParameter: handleInterpolate((s, value) => {
            if (parameters_used_map.has(value)) {
                return parameters_used_map.get(value);
            }
            if (value instanceof SQL) {
                parameters_used = parameters_used.concat(value.parameters);
                parameters_used_map.set(value, value);
            } else {
                parameters_used.push(value);
                parameters_used_map.set(value, new SqlParser.nodes.ParameterValue('$' + (parameters_used.length)));
            }
            return parameters_used_map.get(value);
        })
    });

    return new SQL(ast, [parameters_used]);
}

function expressionHandler(condition) {
    return function (code) {
        code = ['SELECT noop FROM noop WHERE ' + code[0]].concat(_.toArray(code).slice(1));
        var expression = sql.apply(null, [code].concat(_.toArray(arguments).slice(1)));

        var new_ast = Object.create(this.ast);
        new_ast.where = Object.create(new_ast.where);
        new_ast.where.conditions = new SqlParser.nodes.Op(
            condition,
            new_ast.where.conditions,
            expression.ast.where.conditions
        );

        return new SQL(new_ast, this.parameters.concat(expression.parameters));
    };
}

class SQL {
    constructor(ast, parameters) {
        this.ast = ast;
        this.parameters = parameters;
        this.and = expressionHandler('AND');
        this.or = expressionHandler('OR');
    }
    toString() {
        return this.ast.toString();
    }
}

module.exports = sql;
sql.SQL = SQL;


var table = 'INTERPOLATED USER',
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

console.log(query.toString());
