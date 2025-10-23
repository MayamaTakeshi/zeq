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

    const header_val1 = 'abc'
    const header_val2 = 'abc'

    const config = {
        httpsAgent,
        headers: {
            MyCustomHeader: header_val1
        }
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
            req: m.collect('req', {
                url: path,
                method: 'GET',
                headers: {
                    mycustomheader: header_val1,
                },
            }),
            res: m.collect('server_res'),
        },
    ], 1000)

    const response_body = {
        id: 1,
        name: 'jim',
    }

    console.log("request arrived")
    z.$server_res.writeHead(200, {'Content-Type': 'application/json', MyCustomHeader: header_val2})
    z.$server_res.end(JSON.stringify(response_body))

    await z.wait([
        {
            event: 'https_res',
            res: {
                status: 200,
                headers: {
                    mycustomheader: m.collect('header_val'),
                },
                data: response_body,
            }
        },
    ], 1000)

    assert(z.$header_val == header_val2)

    console.log("success")
    process.exit(0)
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
