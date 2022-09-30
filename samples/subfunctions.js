var Zeq = require('../src/index.js')
var m = require('data-matching')
const assert = require('assert')

var events = require('events')

class MyEmitter extends events {}
var em = new MyEmitter()

async function subfunc1(z) {
    setTimeout(() => {
        em.emit("evt1", {'sip_uri': 'sip:jlpicard@tng.st.org:5060'})
    }, 100)

    await subfunc2(z)
}

async function subfunc2(z) {
    await z.wait([
        {
            name: 'evt1',
            args: [
                {
                    'sip_uri': 'sip:!{user_name}@!{host}:!{port:num}',
                },
            ],

        },
    ], 2000)

    await subfunc3(z)
}

async function subfunc3(z) {
    assert(z.store.user_name == 'jlpicard')
    assert(z.store.host == 'tng.st.org')
    assert(z.store.port == 5060)
}

async function test() {
    const z = new Zeq()
    z.trap_events(em, 'my_emitter')

    await subfunc1(z)

    console.log("Finished with success")
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
