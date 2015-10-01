'use strict';

var _ = require('lodash'),
    Immutable = require('immutable'),
    SqlParser = require('sql-parser');

function prototypeReplace(obj, f) {
    var new_obj = Object.create(obj),
        same = true;
    _.each(obj, (value, key) => {
        new_obj[key] = f(value, key);
        same = (new_obj[key] === value) && same;
    });
    return same ? obj : new_obj;
}

/**
 * Interpolate parameters without any wrappers
 */
function rawSQL() {
    var parameters = _.toArray(arguments).slice(1);

    /* parse AST with interpolation place holders */
    var ast = parse.apply(this, arguments);

    /* setup maps for efficient lookup */
    var interpolate_map = new Map(),
        parameters_used = [],
        parameters_used_map = new Map();

    function handleInterpolate(handler) {
        return (s) => interpolate_map.has(s) ? handler(s, interpolate_map.get(s)) : s;
    }

    _.each(parameters, (value, index) => {
        interpolate_map.set(`__interpolation_${index}`, value);
    });

    /* interpolate escaped values into the AST */
    ast = interpolate(ast, {
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
            if (value && value.ast && value.parameters) {

                let ret = mergeVariables(new Immutable.List(parameters_used), {ast: value.ast, parameters: value.parameters});
                parameters_used = ret.parameters.toArray();
                parameters_used_map.set(value, ret.ast);
            } else {
                parameters_used.push(value);
                parameters_used_map.set(value, new SqlParser.nodes.ParameterValue('$' + (parameters_used.length)));
            }
            return parameters_used_map.get(value);
        })
    });

    return {ast: ast, parameters: new Immutable.List(parameters_used)};
}
exports.rawSQL = rawSQL;

function rawExpression(code) {
    code = ['SELECT noop FROM noop WHERE ' + code[0]].concat(_.toArray(code).slice(1));
    var ret = rawSQL.apply(null, [code].concat(_.toArray(arguments).slice(1)));
    return {ast: ret.ast.where.conditions, parameters: ret.parameters};
}
exports.rawExpression = rawExpression;

/**
 * Hack in interpolation handlers to `sql-parser`'s parser.  Variables aren't
 * generic enough because they don't work for table names.
 */
function parse(parts) {
    var parameters = _.toArray(arguments).slice(1);

    var code = _.reduce(
        parts, (acc, x, index) => acc.concat([x, `__interpolation_${index}`]), []
    ).slice(0, -1).join('');

    return SqlParser.parse(code);
}
exports.parse = parse;

/**
 * Handle our hacked in interpolation types into `sql-parser`'s parser:
 *     "(SELECT * FROM __interpolation_${index})"
 *
 * @param {SqlParser.nodes.Node} ast
 * @param {Object} options
 * @param {Function} options.interpolateParameter
 * @param {Function} options.interpolateInline
 */
function interpolate(ast, options) {
    if (!_.isObject(ast)) {
        return ast;
    }

    if (ast instanceof SqlParser.nodes.LiteralValue) {
        if (ast.value instanceof SqlParser.nodes.LiteralValue) {
            return new SqlParser.nodes.Table(
                interpolateInline(ast, options),
                interpolate(ast.value2, options)
            );
            return interpolateInline(ast, options);
        }
        return new SqlParser.nodes.LiteralValue(options.interpolateParameter(ast.value));
    }

    if (ast instanceof SqlParser.nodes.Field) {
        return new SqlParser.nodes.Field(
            interpolateInline(ast.field, options),
            interpolateInline(ast.name, options)
        );
    }

    if (ast instanceof SqlParser.nodes.Table) {
        return interpolateInline(ast, options);
    }

    return prototypeReplace(ast, (value, key) => interpolate(value, options));
}
exports.interpolate = interpolate;

function interpolateInline(ast, options) {
    if (ast instanceof SqlParser.nodes.Table) {
        return new SqlParser.nodes.Table(
            interpolateInline(ast.name, options),
            interpolateInline(ast.alias, options),
            interpolate(ast.win, options),
            interpolate(ast.winFn, options),
            interpolate(ast.winArg, options)
        );
    }
    if (ast instanceof SqlParser.nodes.LiteralValue) {
        if (ast.value instanceof SqlParser.nodes.LiteralValue) {
            return new SqlParser.nodes.Table(
                interpolateInline(ast, options),
                interpolate(ast.value2, options)
            );
            return interpolateInline(ast, options);
        }
        return new SqlParser.nodes.LiteralValue(options.interpolateInline(ast.value));
    }
    return ast;
}
exports.interpolateInline = interpolateInline;

/**
 * Since SQL parameters are ordered, when embedding on SQL statement into
 * another, we need to merge their parameters.
 */
function mergeVariables(parameters, opts) {
    var parameters = new Immutable.List(parameters),
        replacements = new Immutable.Map();

    if (opts.parameters.size === 0) {
        return {ast: opts.ast, parameters: parameters};
    }

    function recurse(nested_ast) {
        if (!_.isObject(nested_ast)) {
            return nested_ast;
        }

        if (nested_ast instanceof SqlParser.nodes.ParameterValue) {

            if (replacements.has(nested_ast.index)) {
                return replacements.get(nested_ast.index);
            }

            var value = opts.parameters.get(nested_ast.index),
                new_ast;
            if (parameters.contains(value)) {
                new_ast = new SqlParser.nodes.ParameterValue('$' + (
                    parameters.indexOf(value) + 1
                ));
            } else {
                parameters = parameters.push(value);
                new_ast = new SqlParser.nodes.ParameterValue('$' + (
                    parameters.size
                ));
            }

            replacements.set(nested_ast.index, new_ast);
            return new_ast;
        }

        return prototypeReplace(nested_ast, (value, key) => recurse(value));
    }

    return {ast: recurse(opts.ast), parameters: parameters};
}
exports.mergeVariables = mergeVariables;
