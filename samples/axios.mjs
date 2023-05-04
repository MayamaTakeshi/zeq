// This shows use of axios without any special zeq features.
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
        console.log("request arrived")
        res.writeHead(200)
        res.end('{"status": 0}')
    }).listen(server_port, server_host)

    console.log("server eventNames:", server.eventNames())

    server.eventNames().forEach(event => {
        console.log("Setting listener for " + event)
        server.on(event, () => {
            console.log("server " + event)
        })
    })

    const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
    })

    const url = `https://${server_host}:${server_port}${path}`

    const config = {
        httpsAgent,
    }

    process.env.http_proxy = ''
    process.env.https_proxy = ''

    const res = await axios.get(url, config)

    assert(res.status == 200)
    assert(res.data.status == 0)

    console.log("success")
    process.exit(0)
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
