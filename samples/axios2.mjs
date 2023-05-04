// This shows use of axios with zeq features.
import axios from 'axios'
import https from 'https'
import Zeq from '../src/index.js'
import m from 'data-matching'
import fs from 'fs'
import assert from 'assert'

const z = new Zeq()

async function test() {
    const server_port = 8888
    const server_host = '0.0.0.0'
    const path = '/'

    const server_options = {
        key: fs.readFileSync('artifacts/server.key'),
        cert: fs.readFileSync('artifacts/server.crt'),
    }

    const server = https.createServer(server_options, (req, res) => {
        z.push_event({
            event: 'https_req',
            req,
            res,
        })
    }).listen(server_port, server_host)

    console.log("server eventNames:", server.eventNames())

    const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
    })

    const url = `https://${server_host}:${server_port}${path}`

    const config = {
        httpsAgent,
    }

    process.env.http_proxy = ''
    process.env.https_proxy = ''

    axios.get(url, config)
    .then(res => {
        z.push_event({
            event: 'https_res',
            res,
        })
    })
    .catch(err => {
        z.push_event({
            event: 'https_err',
            err,
        })
    })

    await z.wait([
        {
            event: 'https_req',
            req: m.collect('req'),
            res: m.collect('server_res'),
        },
    ], 1000)

    console.log("request arrived")
    z.store.server_res.writeHead(200)
    z.store.server_res.end('{"status": 0}')

    await z.wait([
        {
            event: 'https_res',
            res: m.collect('client_res'),
        },
    ], 1000)

    assert(z.store.client_res.status == 200)
    assert(z.store.client_res.data.status == 0)

    console.log("success")
    process.exit(0)
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
