const WebSocket = require('ws');

(async () => {
  try {
    const fetch = require('node-fetch')
    const targetsRes = await fetch('http://127.0.0.1:9222/json')
    const targets = await targetsRes.json()
    if (!targets || !targets.length) { console.error('No targets'); process.exit(1) }
    const url = targets[0].webSocketDebuggerUrl || targets[0].webSocketDebuggerUrl
    console.log('Connecting to', url)
    const ws = new WebSocket(url)
    ws.on('open', () => {
      console.log('WS open')
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }))
      ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }))
    })
    ws.on('message', (data) => {
      try { const msg = JSON.parse(data.toString()); console.log('CDP>', JSON.stringify(msg)) } catch (e) { console.log('RAW>', data.toString()) }
    })
    ws.on('error', (e) => { console.error('WS error', e); process.exit(1) })
  } catch (e) { console.error('Error', e); process.exit(1) }
})()
