// Here we will define zeq util functions.

var util = require("util");
var _ = require("lodash");

var chalk = require("chalk");

var _i = (depth) => {
    return "  ".repeat(depth);
};

var _isSimpleType = (x) => {
    var t = typeof x;
    if (
        t == "string" ||
        t == "boolean" ||
        t == "number" ||
        t == "undefined" ||
        t == "null"
    ) {
        return true;
        //	} else if(t == 'function') {
        //		if(x.__original_data__) return false
        //		else return true
    } else {
        return false;
    }
};

var _prettyPrintDictElements = (dict, depth, visited, keys_to_print) => {
    var keys = Object.keys(dict);
    keys = _.filter(keys, (key) => !key.startsWith("_"));

    if (keys_to_print) {
        if (Array.isArray(keys_to_print)) {
            keys = keys_to_print;
        } else {
            keys = Object.keys(keys_to_print);
        }
    }

    var items = _.chain(keys)
        .map((key) => {
            var val = dict[key];
            var ktp = null;
            if (keys_to_print && typeof keys_to_print == "object") {
                if (typeof val == "object") {
                    ktp = keys_to_print[key];
                }
            }

            if (val == undefined) return undefined; // do not print undefined values

            return (
                _i(depth + 1) +
                key +
                ": " +
                (_isSimpleType(val)
                    ? util.inspect(val)
                    : _prettyPrint(val, depth + 1, true, visited, ktp))
            );
        })
        .filter((s) => {
            return s;
        })
        .value();

    if (!keys_to_print) {
        if (items.length != keys.length) {
            items.push(
                _i(depth + 1) +
                    "... ATTRS WITH NAMES STARTING WITH UNDERSCORE OMITTED ...",
            );
        }
    }
    return items.join(",\n");
};

var _prettyPrintArrayElements = (array, depth, visited) => {
    return _.join(
        _.map(array, (e) => {
            return _prettyPrint(e, depth + 1, false, visited);
        }),
        ",\n",
    );
};

var _prettyPrint = (x, depth = 0, same_line, visited, keys_to_print) => {
    var front_indent = same_line ? "" : _i(depth);
    if (x === undefined) {
        return front_indent + "undefined";
    } else if (x === null) {
        return front_indent + "null";
    } else if (Array.isArray(x)) {
        return (
            front_indent +
            "[\n" +
            _prettyPrintArrayElements(x, depth, visited) +
            "\n" +
            _i(depth) +
            "]"
        );
    } else if (typeof x == "object") {
        /*
		if(util.inspect(x).indexOf('[Circular]') >= 0) {
			return '[Object]'
		}
		*/
        if (visited.includes(x)) {
            return "[CircularReference]";
        }
        visited.push(x);
        return (
            front_indent +
            "{\n" +
            _prettyPrintDictElements(x, depth, visited, keys_to_print) +
            "\n" +
            _i(depth) +
            "}"
        );
    } else if (typeof x == "function" && x.__original_data__) {
        var isArr = Array.isArray(x.__original_data__);
        return (
            front_indent +
            x.__name__ +
            (isArr ? "([\n" : "({\n") +
            (isArr
                ? _prettyPrintArrayElements(x.__original_data__, depth, visited)
                : _prettyPrintDictElements(
                      x.__original_data__,
                      depth,
                      visited,
                  )) +
            "\n" +
            _i(depth) +
            (isArr ? "])" : "})")
        );
    } else if (typeof x == "function" && x.__name__) {
        return front_indent + x.__name__ + "()";
    } else {
        return _i(depth) + util.inspect(x);
    }
};

var prettyPrint = (x, depth = 0, same_line, event_shrinkers) => {
    var keys_to_print = event_shrinkers ? event_shrinkers[x.event] : null;
    if (keys_to_print) {
        keys_to_print = { event: x.event, ...keys_to_print };
    }
    return _prettyPrint(x, depth, same_line, [], keys_to_print);
};

module.exports = {
    prettyPrint: prettyPrint,
};
