var util = require('util')
var matching = require('./matching')
var zutil = require('./zutil')
var chalk = require('chalk')

var _steps = []
var _current_step = null

var _expected_events = []

var _queued_events = []

var _interval_id;


var _match = function(expected, received) {
	console.log("_match got:")
	console.dir(expected)
	console.dir(received)
	var dict = {}
	return expected(received, dict)
}

var _process_event_during_wait = function(evt) {
	var i = _expected_events.length
	if(i > 0) {
		var last_error
		while(i--) {
			try {
				if(_match(_expected_events[i], evt)) {
					console.log(chalk.green("Step wait '") + chalk.blue(_current_step.name) + chalk.green("' got expected event:"))
					console.log(zutil.prettyPrint(evt, 1))
					console.log(chalk.green("while waiting for:"))
					console.log(zutil.prettyPrint(_expected_events))

					// TODO: need to set variables according to data store.
					_expected_events.splice(i, 1)

					if(_expected_events.length == 0) {
						// all events received
						_current_step = null; // this will signal to function 'run' command to proceed with next step
					}
					return
				}
			} catch(e) {	
				last_error = e
			}
		}

		console.error(chalk.red("Step wait '") + chalk.blue(_current_step.name) + chalk.red("' got unexpected event:"))
		console.error(zutil.prettyPrint(evt, 1))
		console.error(chalk.red('while waiting for:'))
		console.error(zutil.prettyPrint(_expected_events))
		process.exit(1)
	}
}

var _process_event_during_sleep = function(evt) {
	console.error(chalk.red("Step sleep '") + chalk.blue(_current_step.name) + chalk.red("' awakened by unexpected event:"))
	console.error(zutil.prettyPrint(evt, 1))
	process.exit(1)
}

var _do_exec = (step) => {
	try {
		step.fn()
		console.log(chalk.green("Step exec finished"))
		_current_step = null
	} catch(e) {
		console.error(chalk.red("Step exec '") + chalk.blue(step.name) + "' failed")
		console.error(chalk.red(e))
	}
}

var _do_wait = (step) => {
	_expected_events = step.events
	while(_queued_events.length > 0) {
		var evt = _queued_events.shift()
		_process_event_during_wait(evt)
	}

	setTimeout(() => {
		if(_expected_events.length > 0) {
			console.error(chalk.red("Step wait '") + chalk.blue(step.name) + chalk.red("' timed out while waiting for:"))
			console.error(zutil.prettyPrint(_expected_events))
			process.exit(1)
		}
		console.log("All expected events received")
		_current_step = null;
	}, step.timeout)
}

var _do_sleep = (step) => {
	if(_queued_events.length > 0) {
		_process_event_during_sleep(_queued_events[0]);
	}

	setTimeout(() => {
		console.log("sleep timeout. Awakening")
		_current_step = null;
	}, step.timeout)
} 

var _run = () => {
	//console.log("run")
	//console.dir(_steps)
	if(_steps.length == 0) {
		console.log(chalk.green("Success"))
		process.exit(0)
	}

	if(!_current_step) {
		_queued_events = [];
		_current_step = _steps.shift()
		console.log(`Starting step ${_current_step.type} '${_current_step.name}'`)

		switch(_current_step.type) {	
		case 'exec':
			_do_exec(_current_step)
			break
		case 'wait':
			_do_wait(_current_step)
			break
		case 'sleep':
			_do_sleep(_current_step)
			break
		default:
			console.error(`Unsupported step ${_current_step.type}`)	
			process.exit(1)
		}
	}

	setTimeout(_run, 1)
}

module.exports = {
	trap_events: function(emitter, name) {
		var orig_emit = emitter.emit
		emitter.emit = function() {
			var args = Array.from(arguments)
			var event_name = args.shift()
			var evt = {
				source: name,
				name: event_name,
				args: args, 
			}
			if(_current_step && _current_step.type == 'wait') {
				_process_event_during_wait(evt)
			} else if(_current_step && _current_step.type == 'sleep') {
				_process_event_during_sleep(evt)
			}	else {
				_queued_events.push(evt)
			}
			orig_emit.apply(emitter, arguments)
		}
	},

	exec: (name, fn) => {
		_steps.push({
			type: 'exec',
			name: name,
			fn: fn,
		})
	},

	wait: (name, events, timeout) => {
		var events2 = []
		for(var i=0 ; i<events.length ; i++) {
			var evt = events[i]
			if(typeof evt == 'function') {
				events2.push(evt)
			} else if (typeof evt == 'array' || typeof evt == 'object') {
				events2.push(matching.partial_match(evt))
			} else {
				throw "Invalid event definition " + evt
			}
		}

		_steps.push({
			type: 'wait',
			name: name,
			events: events2,
			timeout: timeout,
		});
	},

	sleep: (name, timeout) => {
		_steps.push({
			type: 'sleep',
			name: name,
			timeout: timeout,
		})
	},

	run: _run,
}

