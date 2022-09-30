var Zeq = require('../src/index.js')
var m = require('data-matching')
const assert = require('assert')

var events = require('events')

class MyEmitter extends events {}

const test = async (z) => {
    var em = new MyEmitter()

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
                    c: m.is_null,
                    d: m.is_non_zero,
                    e: m.is_non_blank_str,
                    f: m.is_str_equal("3"), 
                    g: m.m('is_greater_than_seven', (e) => {
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

    await z.sleep(1000)
    console.log("Finished with success")
}


async function work() {
    await Promise.all([
        test(new Zeq({id: 'test1'})),
        test(new Zeq({id: 'test2'})),
        test(new Zeq({id: 'test3'})),
        test(new Zeq({id: 'test4'})),
        test(new Zeq({id: 'test5'})),
    ])
}

work()
.then(() => {
    console.log("Complete success")
})
.catch(e => {
    console.error(e)
    process.exit(1)
})
