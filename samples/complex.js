var Zeq = require('../src/index.js')
var m = require('data-matching')
const assert = require('assert')

var events = require('events')

class MyEmitter extends events {}

var em = new MyEmitter()

var z = new Zeq({quiet: true})

async function test() {
    z.trap_events(em, 'my_emitter')

    setTimeout(() => {
        em.emit("evt1", 'arg1', 'arg2', 'arg3', 4, true, new Date)
    }, 4000)

    setTimeout(() => {
        em.emit(
            "evt2",
            {
                a: 1,
                b: 2,
                c: {
                    AA: 1,
                    BB: 2,
                    CC: 3,
                    DD: {
                        AAA: 10,
                        BBB: 20,
                    },
                    EE: 'eeee',
                },
                d: [11,22,33],
            }
        )
    }, 6000)

    setTimeout(() => {
        em.emit("evt3")
        em.emit("evt4")
    }, 1000)

    var filter = {
        name: 'evt4'
    }

    z.add_event_filter(filter)
 
    await z.wait([
        {
            name: 'evt3',
        }	
    ], 2000)

    await z.sleep(1000)

    z.remove_event_filter(filter)

    setTimeout(() => {
        em.emit("evt4")
    }, 1000)

    await z.wait([
        {
            name: 'evt4',
        }	
    ], 2000)

    await z.wait([
        {
            source: 'my_emitter',
            name: 'evt1',
        },
        {
            source: 'my_emitter',
            name: 'evt2',
            args: [
                {
                    a: 1,
                    b: 2,
                    c: {
                        AA: 1,
                        BB: 2,
                        CC: m.collect('the_CC'),
                        DD: {
                            AAA: 10,
                            BBB: 20,
                        },
                        EE: '!{name}',
                    },
                    d: m.full_match([11,22,33]),
                },
            ],
        },
    ], 6000)

    console.log("name=" + z.store.name)
    assert.equal(z.store.name, 'eeee')
    console.log("the_CC=" + z.store.the_CC)
    assert.equal(z.store.the_CC, 3)

    await z.sleep(250)

    await z.sleep(500)

    await z.sleep(1000)

    console.log("Success")
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
