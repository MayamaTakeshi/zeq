var Zeq = require('../src/index.js')
var m = require('data-matching')
const assert = require('assert')

var events = require('events')

class MyEmitter extends events {}

var em = new MyEmitter()

var z = new Zeq()

async function test() {
    z.trap_events(em, 'my_emitter')

    setTimeout(() => {
        em.emit("evt1", {'sip_uri': 'sip:jlpicard@tng.st.org:5060'})
        em.emit("evt2", {a: 1, b: "two", c: null, d: 4, e: 'abc', f: 3, g: 8, h: 'boo'})
    }, 100)

    await z.wait([
        {
            name: 'evt1',
            args: [
                {
                    'sip_uri': 'sip:!{user_name}@!{host}:!{port:num}',
                },
            ],

        },
        {
            name: 'evt2',
            args: [
                {
                    a: 1,
                    b: "two",
                    c: null,
                    d: m.non_zero,
                    e: m.non_blank_str,
                    f: m.str_equal("3"),
                    g: m.m('greater_than_seven', (e) => {
                        return e > 7;
                    }),
                    h: m.collect('my_var'),
                    z: m.absent,
                },
            ],
        },
    ], 2000)

    assert(z.store.user_name == 'jlpicard')
    assert(z.store.host == 'tng.st.org')
    assert(z.store.port == 5060)

    assert(z.store.my_var == 'boo')

    console.log("Finished with success")
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
