// This shows use of got with zeq features.
import got from 'got'
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

    const url = `https://${server_host}:${server_port}${path}`

    const header_val1 = "abc"
    const header_val2 = "cba"

    got.get(
        url,
        {
            https: {
                rejectUnauthorized: false
            },
            headers: {
                MyCustomHeader: header_val1,
            },
        },
    )
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
                headers: {
                    mycustomheader: header_val1,
                },
            }),
            res: m.collect('server_res')
        },
    ], 1000)

    const response_body = {
        id: 1234,
        name: 'ajax'
    }

    console.log("request arrived")
    z.$server_res.writeHead(200, { 'Content-Type': 'application/json', MyCustomHeader: header_val2 })
    z.$server_res.end(JSON.stringify(response_body))

    await z.wait([
        {
            event: 'https_res',
            res: m.collect('res', {
                statusCode: 200,
                statusMessage: 'OK',
                headers: {
                    mycustomheader: header_val2,
                },
                body: m.json(response_body),
            }),
        },
    ], 1000)

    console.log("success")
    process.exit(0)
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
