// This shows use of got/ws/websocket/http-mitm-proxy with zeq features.
import got from 'got'
import https from 'https'
import Zeq from '../src/index.js'
import m from 'data-matching'
import fs from 'fs'
import assert from 'assert'
import websocket from 'websocket' // for server
import ws from 'ws' // for client
import _ from 'lodash'
import { Proxy } from 'http-mitm-proxy'
import {HttpsProxyAgent} from 'hpagent'

const z = new Zeq()

async function test() {
    const proxy_port = 3128
    const proxy_host = '0.0.0.0'

    const server_port = 8888
    const server_host = '0.0.0.0'

    const path = '/'

    const server_options = {
        key: fs.readFileSync('artifacts/server.key'),
        cert: fs.readFileSync('artifacts/server.crt'),
    }

    const server = https.createServer(server_options, (req,res) => {
        z.push_event({
            event: 'https_req',
            req,
            res,
        })
    })
    .listen(server_port, server_host)

    console.log("server eventNames:", server.eventNames())

    const proxy = new Proxy()

    proxy.onRequest(function(ctx, callback) {
        console.log('proxy: request arrived')
        ctx.proxyToServerRequestOptions.rejectUnauthorized = false
        return callback()
    })

    proxy.onError(function(ctx, err) {
        console.error('proxy error:', err)
    })

    proxy.listen({port: proxy_port}) //, host: proxy_host})
    console.log(`proxy listening on ${proxy_host}:${proxy_port}`)

    const wsServer = new websocket.server({
        httpServer: server,
        // You should not use autoAcceptConnections for production
        // applications, as it defeats all standard cross-origin protection
        // facilities built into the protocol and the browser.  You should
        // *always* verify the connection's origin and decide whether or not
        // to accept it.
        autoAcceptConnections: false,
    })

    wsServer.on('request', function(request) {
        const conn = request.accept()
        z.push_event({
            event: 'wss_conn',
            conn,
        })
    })


    // First we confirm we can talk to the shared https/wss server using plain HTTP
    const url = `https://${server_host}:${server_port}${path}/gen_token`

    got.get(
        url,
        {
            https: {
                rejectUnauthorized: false
            },
            agent: new HttpsProxyAgent({
                proxy: `http://${proxy_host}:${proxy_port}`,
            }),
        },
    )
    .json()
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
            res: m.collect('server_res')
        },
    ], 2000) // proxying is slow

    console.log("request arrived")
    z.store.server_res.writeHead(200)
    z.store.server_res.end('{"status": 0, "token": "fake_token"}')

    await z.wait([
        {
            event: 'https_res',
            res: m.collect('client_res')
        },
    ], 1000)

    assert(z.store.client_res.status == 0)

    const token = z.store.client_res.token

    // Now open a websocket connection

    const wsClient = new ws(`wss://${server_host}:${server_port}${path}/ws/`, {
        rejectUnauthorized: false,
        agent: {
            https: new HttpsProxyAgent({
                proxy: `http://${proxy_host}:${proxy_port}`,
            }),
        },
    })

    wsClient.on('open', () => {
        z.push_event({
            event: 'wss_open',
        })
    })

    wsClient.on('error', err => {
        z.push_event({
            event: 'wss_err',
            err,
        })
    })

    wsClient.on('close', () => {
        z.push_event({
            event: 'wss_close',
        })
    })

    wsClient.on('message', (msg) => {
        z.push_event({
            event: 'wss_msg',
            source: 'client',
            msg,
        })
    })

    await z.wait([
        {
            event: 'wss_open',
        },
        {
            event: 'wss_conn',
            conn: m.collect('conn'),
        },
    ], 1000)

    z.store.conn.on('message', msg => {
        z.push_event({
            event: 'wss_msg',
            source: 'server',
            msg
        })
    })

    const msg = {
        access_token: token,
        type: 'start',
        sampling_rate: 8000,
        product_name: 'fake',
        organization_id: 'fake',
    }

    wsClient.send(JSON.stringify(msg))

    await z.wait([
        {
            event: 'wss_msg',
            source: 'server',
            msg: m.collect('msg'),
        }
    ], 1000)

    console.log(z.store.msg)

    console.log("success")
    process.exit(0)
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
