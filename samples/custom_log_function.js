var Zeq = require('../src/index.js')
var m = require('data-matching')
const assert = require('assert')
var moment = require('moment')

var events = require('events')

class MyEmitter extends events {}

var em = new MyEmitter()

var z = new Zeq({
    id: 'mytest',
    log_function: (level, msg) => {
        console.log(`${moment().format("YYYY-MM-DD HH:mm:ss.SSS")} ${level} ${msg}`)
    },
})

async function test() {
    await z.sleep(100)
    await z.sleep(200)
    await z.sleep(300)
    console.log("Finished with success")
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
