// Here we will define zeq util functions.

var util = require('util')
var _ = require('lodash')

var chalk = require('chalk')

var _i = (depth) => {
	return "  ".repeat(depth)
}

var _isSimpleType = (x) => {
	var t = typeof(x)
	if(t == 'string' || t == 'boolean' || t == 'number' || t == 'undefined' || t == 'null') {
		return true
//	} else if(t == 'function') {
//		if(x.__original_data__) return false
//		else return true
	} else {
		return false
	}
}

var _prettyPrintDictElements = (dict, depth, visited) => {
	var keys = Object.keys(dict)
	var printableKeys = _.filter(keys, (key) => !key.startsWith("_"))
	var items = _.chain(printableKeys).map((key) => { 
			var val = dict[key]
			return _i(depth+1) + key + ": " + (_isSimpleType(val) ? util.inspect(val) : _prettyPrint(val, depth+1, true, visited))  
		}
	).value()
	if(items.length != keys.length) {
		items.push(_i(depth+1) + "... ATTRS WITH NAMES STARTING WITH UNDERSCORE OMITTED ...")
	}
	return items.join(",\n")
}

var _prettyPrintArrayElements = (array, depth, visited) => {
	return _.join(_.map(array, (e) => { 
		return _prettyPrint(e, depth+1, false, visited)
	}),',\n')
}

var _prettyPrint = (x, depth=0, same_line, visited) => {
	var front_indent = same_line ? '' : _i(depth)
	if(x === undefined) {
		return front_indent + 'undefined'
	} else if(x === null) {
		return front_indent + 'null'
	} else if(Array.isArray(x)) {
		return front_indent + "[\n" + _prettyPrintArrayElements(x, depth, visited) + "\n" + _i(depth) + "]"
	} else if(typeof x == 'object') {
		/*
		if(util.inspect(x).indexOf('[Circular]') >= 0) {
			return '[Object]'
		}
		*/
		if(visited.includes(x)) {
			return '[CircularReference]'
		}
		visited.push(x)
		return front_indent + "{\n" + _prettyPrintDictElements(x, depth, visited) + "\n" + _i(depth) + "}"
	} else if(typeof x == 'function' && x.__original_data__) {
		var isArr = Array.isArray(x.__original_data__) 
		return front_indent + x.__name__ + 
			(isArr ? "([\n" : "({\n") + 
			(isArr ? _prettyPrintArrayElements(x.__original_data__, depth) : _prettyPrintDictElements(x.__original_data__, depth, visited)) + "\n" +
			_i(depth) + (isArr ? "])" : "})")
	} else if(typeof x == 'function' && x.__name__) {
		return front_indent + x.__name__ + '()'
	} else {
		return _i(depth) + util.inspect(x)
	}
}

var prettyPrint = (x, depth=0, same_line) => {
	return _prettyPrint(x, depth, same_line, [])
}

module.exports = {
	prettyPrint: prettyPrint,
}

