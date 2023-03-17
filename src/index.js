require('magic-globals')

var util = require('util')
var matching = require('data-matching')
var zutil = require('./zutil')
var chalk = require('chalk')
var m = require('moment')

Object.defineProperty(global, '__caller_line', {
get: function() {
    var filePath = __stack[2].getFileName()
    var tokens = filePath.split("/")
    var fileName = tokens[tokens.length - 1]
    var lineNumber = __stack[2].getLineNumber()
    return fileName + ":" + lineNumber
    }
});

// short timestamp to be easy to follow while tests are executed
function ts() { return m().format("HH:mm:ss.SSS") }

function default_log_function(level, msg) {
    console.log(ts() + " " + msg)
}

class Zester {
    constructor(opts) {
        this.id = ''
        this.log_function = default_log_function

        if(opts) {
            if(opts.id) {
                this.id = opts.id
            }

            if(opts.log_function) {
                this.log_function = opts.log_function
            }
        }

        this.expected_events = []

        this.queued_events = []

        this.dict = {}

        this.store = {}

        this.event_filters = []

        this.current_op_name = null
        this.current_op_line = null

        this.resolve = null
        this.reject = null
        this.timer_id = null
    }

    print_white(s) {
        this.log_function('INFO', this.id + " " + s)
    }

    print_green(s) {
        this.log_function('INFO', chalk.green(this.id + " " + s))
    }

    print_red(s) {
        this.log_function('ERROR', chalk.red(this.id + " " + s))
    }

    match(expected, received, idx) {
        //this.print_white("match got:")
        //console.dir(expected)
        //console.dir(received)
        return expected(received, this.dict, true, 'expected_events[' + idx + ']')
    }

    set_store_vars(dict) {
        for(var key in dict) {
            if(key == '_') continue

            var val = dict[key]
            this.print_white("Trying to set " + key)
            if(this.store[key] == null) {
                this.print_white(zutil.prettyPrint(val, 1))
                this.store[key] = val
            } else {
                if(this.store[key] != val) {
                    this.print_red(`Cannot store['${key}'] to '${val}' as it is already set to '${this.store[key]}'`)
                    process.exit(1)
                }
            }
        }
    }

    process_event_during_wait(evt) {
        this.print_white("")
        this.print_white(`wait (${this.current_op_line}) got event:`)
        this.print_white(zutil.prettyPrint(evt, 1))

        var temp = this.expected_events.slice() // copy array
        var matching_errors = []

        var matched = false

        for(var i=0 ; i<temp.length ; ++i) {
            try {
                this.print_white("")
                this.print_white(`Trying match against expected_events[${i}]:`)
                this.print_white(zutil.prettyPrint(temp[i], 1))

                if(this.match(temp[i], evt, i)) {
                    this.print_white(`Match successful`)

                    this.set_store_vars(this.dict)
                    this.print_white("")
                    this.print_green(`wait (${this.current_op_line}) got expected event:`)
                    this.print_white(zutil.prettyPrint(evt, 1))

                    this.expected_events.splice(i, 1)
                    matched = true
                    break
                }
            } catch(e) {
                if(e instanceof matching.MatchingError) {
                    this.print_white(`No match: ${e.path}: ${e.reason}`)
                    matching_errors[i] = e
                } else {
                    this.print_red(e)
                    clearTimeout(this.timer_id)
                    this.timer_id = null
                    this.reject(e)
                    return
                }
            }
        }

        if(matched) {
            if(this.expected_events.length == 0) {
                this.print_white("All expected events received")
                this.print_green(`wait (${this.current_op_line}) finished`)

                this.current_op_name = null

                clearTimeout(this.timer_id)
                this.timer_id = null
                this.resolve()
            }
        } else {
            this.print_red("")
            this.print_red(`wait (${this.current_op_line}) got unexpected event:`)
            this.print_white(zutil.prettyPrint(evt, 1))
            this.print_red("")
            this.print_red('while waiting for expected_events:')
            this.print_white("[")
            this.expected_events.forEach((e, idx, arr) => {
                var me = matching_errors[idx];
                var reason = `${me.path}: ${me.reason}`;
                reason = reason.replace( /^expected_events\[[0-9]+\]/, '');
                this.print_white(zutil.prettyPrint(e))
                this.print_red("  NO_MATCH_REASON: "  + reason + "\n")
            })
            this.print_white("]")
            clearTimeout(this.timer_id)
            this.timer_id = null
            this.reject('got_unexpected_event')
        }
    }

    process_event_during_sleep(evt) {
        this.print_red(`sleep (${this.current_op_line}) awakened by unexpected event:`)
        this.print_white(zutil.prettyPrint(evt, 1))
        clearTimeout(this.timer_id)
        this.timer_id = null
        this.reject('awakened_by_unexpected_event')
    }

    should_ignore_event(evt) {
        for (var i=0 ; i<this.event_filters.length ; ++i) {
            try {
                if(this.match(this.event_filters[i][1], evt, i)) {
                    return true                    
                }
            } catch(e) {
                //do nothing    
            }
        }
        return false
    }

    handle_event(evt) {
        if(this.should_ignore_event(evt)) {
            this.print_white("Ignoring event:")
            this.print_white(zutil.prettyPrint(evt, 1))
            return
        }

        if(this.current_op_name == 'wait') {
            this.process_event_during_wait(evt)

            if(this.expected_events.length == 0) {
                this.print_white("All expected events received")
                this.print_green(`wait (${this.current_op_line}) finished`)
                this.current_op_name = null
            }
        } else if(this.current_op_name == 'sleep') {
            this.process_event_during_sleep(evt)
        } else {
            this.queued_events.push(evt)
        }
    }

    check_op(type, caller_line, params, spec) {
        if(['wait', 'sleep'].includes(type)) {
            if(this.current_op_name) {
                this.print_red(`${type} (${caller_line}): cannot start because ${this.current_op_name} (${this.current_op_line}) is in progress`)
                process.exit(1)
            }
        }

        if(params.length != spec.length) {
            this.print_red(`${type} (${caller_line}): invalid number of params. Expected ${spec.length}. Got ${params.length}`)
            process.exit(1)
        }

        for(var i=0 ; i<spec.length ; ++i) {
            if(typeof params[i] != spec[i]) {
                this.print_red(`${type} (${caller_line}): invalid type for param ${i+1}. Expected '${spec[i]}'. Got '${typeof params[i]}'`)
                process.exit(1)
            }
        }
    }

    // IMPORTANT: do not change this to '() => {...}' as arguments is not available on arrow functions
    trap_events(emitter, name, preprocessor) {
        var orig_emit = emitter.emit
        var self = this
        emitter.emit = function() {
            var args = Array.from(arguments)
            var event_name = args.shift()
            var evt = {
                source: name,
                name: event_name,
                args: args, 
            }
            if(preprocessor) {
                evt = preprocessor(evt)
            }
            self.handle_event(evt)
            orig_emit.apply(emitter, arguments)
        }
    }

    // IMPORTANT: do not change this to '() => {...}' as arguments is not available on arrow functions
    callback_trap(name, preprocessor) {
        var self = this
        return function() {
            var evt = {
                source: 'callback',
                name: name,
                args: Array.from(arguments),
            }
            if(preprocessor) {
                evt = preprocessor(evt)
            }
            self.handle_event(evt)
        }
    }

    push_event(evt) {
        this.handle_event(evt)
    }

    async wait(events, timeout) {
        this.check_op('wait', __caller_line, [events, timeout], ['object', 'number']) 
        var events2 = []
        for(var i=0 ; i<events.length ; i++) {
            var evt = events[i]
            if(typeof evt == 'function') {
                events2.push(evt)
            } else if (typeof evt == 'array' || typeof evt == 'object') {
                events2.push(matching.partial_match(evt))
            } else {
                this.print_red(`wait (${__line}): invalid event definition ` + evt)
                process.exit(1)
            }
        }

        this.print_green(`wait (${__caller_line}) started. Waiting for expected_events:`)

        this.current_op_name = 'wait'
        this.current_op_line = __caller_line
        this.dict = {}
        this.expected_events = events2

        this.print_white(zutil.prettyPrint(this.expected_events))

        return new Promise((resolve, reject) => {
            while(this.queued_events.length > 0) {
                var evt = this.queued_events.shift()
                this.process_event_during_wait(evt)
            }

            if(this.expected_events.length == 0) {
                this.print_white("All expected events received")
                this.print_green(`wait (${this.current_op_line}) finished`)
                this.current_op_name = null
                resolve()
            }

            this.resolve = resolve
            this.reject = reject

            this.timer_id = setTimeout(() => {
                var e = `wait (${this.current_op_line}) timed out`
                this.print_red(`${e} while waiting for:`)
                this.print_white(zutil.prettyPrint(this.expected_events))
                this.timer_id = null
                this.reject(e)
            }, timeout)
        })
    }

    async sleep(timeout) {
        this.check_op('sleep', __caller_line, [timeout], ['number']) 

        this.print_green(`sleep (${__caller_line}) started`)
        this.current_op_name = 'sleep'
        this.current_op_line = __caller_line

        return new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject

            if(this.queued_events.length > 0) {
                this.process_event_during_sleep(this.queued_events[0]);
            }

            this.timer_id = setTimeout(() => {
                this.print_green(`sleep (${this.current_op_line}) finished`)
                this.current_op_name = null
                var resolve = this.resolve
                this.timer_id = null
                this.resolve = null
                this.reject = null
                resolve()
            }, timeout)
        })
    }

    add_event_filter(ef) {
        var mf
        if(typeof ef == 'function') {
            mf = ef
        } else if (typeof ef == 'array' || typeof ef == 'object') {
            mf = matching.partial_match(ef)
        } else {
            this.print_red("Invalid event filter definition for " + __func)
            console.dir(ef)
            process.exit(1)
        }
        this.event_filters.push([ef, mf])
    }

    remove_event_filter(ef) {
        this.check_op(__func, __caller_line, [ef], ['object'])

        var len = this.event_filters.length

        this.event_filters = this.event_filters.filter(f => {
            return f[0] != ef;
        })

        if(len == this.event_filters.length) {
            this.print_red(`remove_event_filter failed: filter not found`)
            process.exit(1)
        }
    }
}

module.exports = Zester
