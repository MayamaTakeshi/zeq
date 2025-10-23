import fetch from 'node-fetch'
import https from 'https'
import Zeq from '../src/index.js'
import m from 'data-matching'
import fs from 'fs'
import assert from 'assert'

const z = new Zeq()

async function test() {
    const server_port = 8888
    const server_host = '0.0.0.0'
    const path = '/test'

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
    const header_val2 = 'cba'

    fetch(
        url,
        {
            agent: httpsAgent,
            headers: {
                MyCustomHeader: header_val1,
            },
        }
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
                method: 'GET',
                headers: {
                    mycustomheader: header_val1,
                },
            }),
            res: m.collect('server_res'),
        }
    ], 1000)

    console.log(z.$req)

    const response_body = {
        id: 100,
        name: 'tom',
    }

    console.log("request arrived")
    z.$server_res.writeHead(200, {'Content-Type': 'application/json', MyCustomHeader: header_val2})
    z.$server_res.end(JSON.stringify(response_body))

    // using fetch we cannot do headers['mycustomheader'] and need to do headers.get('mycustomheader') instead.
    // Also, the body must be obtained by calling 'await res.json()', 'await res.string()' etc and because of this
    // we cannot check the body in a matching function as it would need to be defined as 'async' but currently, we
    // don't support this
    await z.wait([
        {
            event: 'https_res',
            res: m.collect('res', {
                status: 200,
                statusText: 'OK',
                headers: (obj) => {
                    if(obj.get('mycustomheader') != header_val2) return false
                    return true
                },
            })
        },
    ], 1000)

    const body = await z.$res.json()

    assert(m.full_match(body, response_body))

    console.log("success")
    process.exit(0)
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})

/*
After exection of this script you might see a warning like this:
(node:59789) [https://github.com/node-fetch/node-fetch/issues/1000 (response)] DeprecationWarning: data doesn't exist, use json(), text(), arrayBuffer(), or body instead
This is happening because we have 'data' in the http shrinkers in src/index.js:

        this.event_shrinkers = {
            https_req: {
                req: ['url', 'method', 'headers', 'data', 'body'],
            },
            https_res: {
                res: ['status', 'statusText', 'headers', 'data', 'body'],
            }
        }

So we try to access res.data to prettyPrint it causing the above warning. Then we get undefined and suppress it output and so you don't see it in the events.
*/

