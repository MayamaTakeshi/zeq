var Zeq = require('../src/index.js')
var m = require('data-matching')
const assert = require('assert')
var events = require('events')
var MySql = require('sync-mysql')

var z = new Zeq()

async function test() {
    class MyEmitter extends events {}

    var em = new MyEmitter()

    z.trap_events(em, 'my_emitter')

    setTimeout(() => {
        em.emit("evt1", 'arg1', 'arg2', 'arg3', 4, true, new Date)
    }, 100)

    await z.wait([
        {
            source: 'my_emitter',
            name: 'evt1',
            args: [
                'arg1',
                'arg2',
                'arg3',
                4,
                m.collect('some_bool'),
                undefined,
            ],	
        }
    ], 500)

    console.log(`some_bool: ${z.store.some_bool}`)

    var connection = new MySql({
        host: 'localhost',
        user: 'me',
        password: 'secret',
    })

    var res = connection.query("SELECT 1 AS val")
    assert(res[0].val === 1)


    setTimeout(() => {
        em.emit("evt2", 'arg1', 'arg2', 'arg3', 4, true, new Date)
    }, 100)

    await z.wait([
        {
            source: 'my_emitter',
            name: 'evt2',
            args: [
                'arg1',
                'arg2',
                'arg3',
                4,
                m.collect('some_bool'),
                m.collect('date')
            ],	
        }
    ], 500)

    console.log(`some_bool: ${z.store.some_bool}`)
    console.log(`date: ${z.store.date}`)

    console.log("Success")
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
