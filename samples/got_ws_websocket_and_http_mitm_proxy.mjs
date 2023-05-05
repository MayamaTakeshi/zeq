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

    const token = 'fake_token'

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

    server.on('upgrade', function() {
        console.log("got server upgrade")
    })

    server.on('tlsClientError', err => {
        console.log("got server tlsClientError")
        console.log(err)
        process.exit(0)
    })


    console.log("server eventNames:", server.eventNames())
    server.eventNames().forEach(name => {
        server.on(name, (data) => {
            console.log("got server", name)
        })
    })

    const proxy = new Proxy()

    proxy.onRequest(function(ctx, callback) {
        console.log('proxy: request arrived')
        ctx.proxyToServerRequestOptions.rejectUnauthorized = false
        return callback()
    })

    proxy.onWebSocketConnection(function(ctx, callback) {
      console.log('onWebSocketConnection')
      console.log(Object.keys(ctx))
      //process.exit(0)
      ctx.proxyToServerWebSocketOptions.rejectUnauthorized = false
      console.log('WEBSOCKET CONNECT:', ctx.clientToProxyWebSocket.upgradeReq.url);
      return callback();
    });

    proxy.onWebSocketError(function(ctx, err) {
      console.log('WEBSOCKET ERROR:', ctx.clientToProxyWebSocket.upgradeReq.url, err);
    });

    proxy.onError(function(ctx, err) {
        console.error('proxy error:', err)
    })

    proxy.listen({port: proxy_port, host: proxy_host}, () => {
        console.log(`proxy listening on ${proxy_host}:${proxy_port}`)
        z.push_event({
            event: 'proxy_ready',
        })
    })

    await z.wait([
        {
            event: 'proxy_ready',
        }
    ], 2000)

    //await z.sleep(60 * 1000)

    const wsServer = new websocket.server({
        httpServer: server,
        // You should not use autoAcceptConnections for production
        // applications, as it defeats all standard cross-origin protection
        // facilities built into the protocol and the browser.  You should
        // *always* verify the connection's origin and decide whether or not
        // to accept it.
        autoAcceptConnections: true,
    })

    console.log(Object.keys(wsServer))
    console.log(wsServer._events)
    console.log("wsServer eventNames:", wsServer.eventNames())

    wsServer.on('upgrade', function() {
        console.log("wsServer on upgrade")
        z.push_event({
            event: 'wss_upgrade',
        })
    })

    wsServer.on('upgradeError', function(err) {
        console.log("wsServer on upgradeError")
        z.push_event({
            event: 'wss_upgrade_error',
        })
    })

    wsServer.on('connect', function(conn) {
        console.log("wsServer on connect")
        z.push_event({
            event: 'wss_conn',
            conn,
        })
    })

    // the below doesn't happen
    /*
    wsServer.on('request', function(request) {
        console.log("wsServer on request")
        const conn = request.accept()
        z.push_event({
            event: 'wss_conn',
            conn,
        })
    })
    */

    process.env.http_proxy = ''
    process.env.https_proxy = ''


    // First we confirm we can talk to the shared https/wss server using plain HTTP
    const url = `https://${server_host}:${server_port}${path}/gen_token`

    got.get(
        url,
        {
            https: {
                rejectUnauthorized: false
            },
            agent: {
                https: new HttpsProxyAgent({
                        /*
                        keepAlive: true,
                        keepAliveMsecs: 1000,
                        maxSockets: 256,
                        maxFreeSockets: 256,
                        scheduling: 'lifo',
                        */
                        proxy: `http://${proxy_host}:${proxy_port}`,
                }),
            },
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
        console.log('err')
        console.log(err)
        process.exit(0)
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
    ], 5000) // proxying is slow

    console.log("request arrived")
    z.store.server_res.writeHead(200)
    z.store.server_res.end(`{"status": 0, "token": "${token}"}`)

    await z.wait([
        {
            event: 'https_res',
            res: m.collect('client_res')
        },
    ], 1000)

    assert(z.store.client_res.status == 0)



    // Now test websocket connection against the same server

    const wsClient = new ws(`wss://${server_host}:${server_port}${path}/ws/`, {
        rejectUnauthorized: false,
        agent: new HttpsProxyAgent({
            proxy: `http://${proxy_host}:${proxy_port}`,
        }),
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
    ], 5000) // proxying is slow
 
    await z.wait([
        {
            event: 'wss_conn',
            conn: m.collect('conn'),
        },
    ], 5 * 1000) // proxying is slow
 

    // send message from client to server

    const msg = {
        access_token: token,
        type: 'start',
        sampling_rate: 8000,
        product_name: 'fake',
        organization_id: 'fake',
    }

    wsClient.send(JSON.stringify(msg))

    z.store.conn.on('message', msg => {
        z.push_event({
            event: 'wss_msg',
            source: 'server',
            msg
        })
    })

    z.store.conn.on('close', (reasonCode, description) => {
         z.push_event({
            event: 'wss_close',
            reasonCode,
            description,
        })
    })

    await z.wait([
        {
            event: 'wss_msg',
            source: 'server',
            msg: m.collect('msg_from_client'),
        }
    ], 1000)

    console.log(z.store.msg_from_client)

    // send msg from server to client
    const msg_from_server = {status: 0}
    z.store.conn.sendUTF(JSON.stringify(msg_from_server))

    await z.wait([
        {
            event: 'wss_msg',
            source: 'client',
            msg: m.collect('msg_from_server'),
        },
    ], 1000)

    console.log(z.store.msg_from_server.toString(), JSON.stringify(msg_from_server))
    assert(_.isEqual(JSON.parse(z.store.msg_from_server.toString()), msg_from_server))

    console.log("success")
    process.exit(0)
}

test()
.catch(e => {
    console.error(e)
    process.exit(1)
})
