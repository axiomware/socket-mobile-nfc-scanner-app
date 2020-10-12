/*
 * SocketMobile S550 and D600 NFC scanner applications
 *
 * Copyright(C) 2020 Axiomware Systems, Inc.
 *
 * See LICENSE for more information
 */

'use strict'

const logger = require('pino')({ level: process.env.LEVEL || 'info' }, process.stderr)
const minimist = require('minimist')
const nconf = require('nconf')
const gapiV3Lib = require('gapi-v3-sdk')
const d600ReaderLib = require('./lib/d600ReaderLib.js')
const springCoreLib = require('./lib/springCoreUtils.js')

process.stdin.resume() // so the program will not close instantly

process.on('exit', function (err) { // On exit handler
  console.log('Goodbye!')
})

process.on('unhandledRejection', (reason, p) => { // Unhandled promise rejections.
  console.log('Unhandled Rejection at: Promise', p)
  // application specific handling here
})

process.on('uncaughtException', (reason, p) => { // Unhandled exceptions
  console.log(p, 'reason:', reason)
  // application specific handling here
})

const args = minimist(process.argv.slice(2), {
  string: ['host', // MQTT broker IP addr
    'port', // MQTT broker port
    'prefix'], // Topic prefix
  alias: { h: 'host', p: 'port', t: 'prefix' },
  default: {
    host: '192.168.8.1',
    port: '1883',
    prefix: 'netrunrfe/'
  }
})

// Store GATT cache info
nconf.file({ file: './config/config_gatt.json' })

nconf.load()

const d600Utils = new d600ReaderLib.D600Utils() // Library for SocketMobile D600 Scanner
const scUtils = new springCoreLib.SpringCoreUtils() // Library for SocketMobile S550 Scanner
var gHostFE = args.host
var gPortFE = args.port
var gOptionsFE = {
  username: '',
  password: ''
}

var gTopicPrefixFE = args.prefix

var connectionPendingNodeList = {}

const gNetrunrClient = new gapiV3Lib.GapiClient()
main()

async function main () {
  gNetrunrClient.on('heartbeat', gwHeartbeatHandler)
  await gNetrunrClient.init(gHostFE, gPortFE, gOptionsFE, gTopicPrefixFE)
}

async function gwHeartbeatHandler (hbtData) {
  logger.info({ log: hbtData }, `[${hbtData.id}]:Heartbeat data`)
  if (!gNetrunrClient.getBleLinkStatus(hbtData.id)) {
    const gwHandle = await gNetrunrClient.createBleLink(hbtData.id)
    logger.info({ log: gwHandle.info }, `[${gwHandle.gwid}]:System Info`)
    gwHandle.on('create', bleLinkHandler)
    gwHandle.on('adv', bleAdvHandler)
    gwHandle.on('event:scan', bleScanEventHandler)
  }
}

async function bleLinkHandler (linkHandle) {
  linkHandle.defaultTimeout = 20000 // reduce timeout to 20 secs
  logger.info(`[${linkHandle.gwid}]:New Timeout: ${linkHandle.defaultTimeout}`)

  const ver = await linkHandle.version()
  logger.info({ log: ver }, `[${linkHandle.gwid}]:Version`)

  const ping = await linkHandle.ping()
  logger.info({ log: ping }, `[${linkHandle.gwid}]:ping`)

  const ret6a = await linkHandle.show(5000)
  logger.info({ log: ret6a }, `[${linkHandle.gwid}]:show`)
  await sleep(5000)

  ret6a.nodes.forEach(async node => {
    const retDiscon = await linkHandle.disconnectNode(node)
    logger.info({ log: retDiscon }, `[${linkHandle.gwid}]:disconnectNode`)
  })

  linkHandle.scanListen(true) // listen to background scan results

  const ret3 = await linkHandle.scanStart({ active: false, period: 5, filter: 2, broadcast: true }, 5000)
  logger.info({ log: ret3 }, `[${linkHandle.gwid}]:scanStart`)
  await sleep(5000)
}

async function bleAdvHandler (linkHandle, gwid, advData) {
  var advArrayMap = advData.nodes.map(axAdvExtractData)// Extract data

  var D600UBadv = advArrayMap.filter(axAdvMatchD600Unbonded)// Filter adv for D600 without pairing feature
  var D600Badv = advArrayMap.filter(axAdvMatchD600Bonded)// Filter adv for D600 with pairing feature
  var S550adv = advArrayMap.filter(axAdvMatchS550)// Filter adv S550

  const connenctionParameters = {
    interval_min: 20, /* x1.25ms */
    interval_max: 50, /* x1.25ms */
    latency: 4,
    timeout: 1000, /* x10ms */
    wait: 15
    // att_mtu:
  }

  D600UBadv.forEach(nodeObj => { // connect to all D600UB devices
    logger.info({ log: nodeObj }, `[${gwid}]:adv D600UBadv`)
    if (!(nodeObj.node in connectionPendingNodeList)) {
      connectionPendingNodeList[nodeObj.node] = true
      linkHandle.connect(nodeObj, connenctionParameters, 20000).then((devHdl) => {
        delete connectionPendingNodeList[nodeObj.node]
        if (devHdl.subcode == 0) {
          D600UnbondedDeviceHandler(devHdl)
        }
      })
    }
  })

  D600Badv.forEach(nodeObj => { // connect to all D600B devices
    logger.info({ log: nodeObj }, `[${gwid}]:adv D600Badv`)
    if (!(nodeObj.node in connectionPendingNodeList)) {
      connectionPendingNodeList[nodeObj.node] = true
      linkHandle.connect(nodeObj, connenctionParameters, 20000).then((devHdl) => {
        delete connectionPendingNodeList[nodeObj.node]
        if (devHdl.subcode == 0) {
          D600BondedDeviceHandler(devHdl)
        }
      })
    }
  })

  S550adv.forEach(nodeObj => { // connect to all S550 devices
    logger.info({ log: nodeObj }, `[${gwid}]:adv S550adv`)
    if (!(nodeObj.node in connectionPendingNodeList)) {
      connectionPendingNodeList[nodeObj.node] = true
      linkHandle.connect(nodeObj, connenctionParameters, 20000).then((devHdl) => {
        delete connectionPendingNodeList[nodeObj.node]
        if (devHdl.subcode == 0) {
          S550ReaderdeviceHandler(devHdl)
        }
      })
    }
  })
}

async function D600UnbondedDeviceHandler (devHandle) {
  let GATT = []
  logger.info({ log: devHandle.node }, `[${devHandle.node}]:Connected`)
  if (!nconf.get('GATT:D600UNBONDED')) { // check if cached copy of GATT table is available
    GATT = await discoverGATTtable(devHandle, 3)
    if (!nconf.get('GATT:D600UNBONDED')) {
      nconf.set('GATT:D600UNBONDED', GATT)
      nconf.save(function (err) {
        if (err) {
          logger.info({ log: err }, 'nconf save error 1')
        }
      })
    }
  } else {
    GATT = nconf.get('GATT:D600UNBONDED')
  }

  logger.info({ log: GATT }, `[${devHandle.node}]:GATT`)

  const chrConfigIO = findGATTHandle(GATT, '88cac58fd616fd9a224ec7f7c985437a', '73ce8dd2c771a8a0b24b6e3372fc5412')// '0063'
  logger.info({ log: chrConfigIO }, `[${devHandle.node}]:chr handle`)

  const chrScanData = findCCCDHandle(GATT, '3cf0155f53d7b1acef4ef696b701b56c', '20a6150bfc5f78ba134671d8b8813ece')// '0055'
  logger.info({ log: chrScanData }, `[${devHandle.node}]:chr handle`)
  if (chrConfigIO.length > 0 && chrScanData.length > 0) {
    const ret7a = await devHandle.write({ sh: chrConfigIO[0].sh, value: '03ae07' })
    logger.info({ log: ret7a }, `[${devHandle.node}]:write config`)

    const ret8a = await devHandle.subscribeIndicationDirect(chrScanData[0], dataHandlerD600)
    logger.info({ log: ret8a }, `[${devHandle.node}]:subscribeIndication`)
  }
}

async function D600BondedDeviceHandler (devHandle) {
  let GATT = []
  logger.info({ log: devHandle.node }, `[${devHandle.node}]:Connected`)
  if (!nconf.get('GATT:D600BONDED')) {
    GATT = await discoverGATTtable(devHandle, 3)
    if (!nconf.get('GATT:D600BONDED')) {
      nconf.set('GATT:D600BONDED', GATT)
      nconf.save(function (err) {
        if (err) {
          logger.info({ log: err }, 'nconf save error 1')
        }
      })
    }
  } else {
    GATT = nconf.get('GATT:D600BONDED')
  }

  logger.info({ log: GATT }, `[${devHandle.node}]:GATT   zzzzzzzzzzzzzzzzzzzzzzzzzzzz`)

  const iobj = { // secure & pairing
    iocap: 0,
    oob: 0,
    auth: 1,
    key_max: 7,
    key_value: '',
    key_length: 0,
    init: 0x01,
    resp: 0x01
  }

  try {
    const ret6a = await devHandle.pair(iobj)
    logger.info({ log: ret6a }, `[${devHandle.node}]:Pair`)
  } catch (err) {
    logger.info({ log: err }, `[${devHandle.node}]:Pair error`)
    return
  }
  const chrConfigIO = findGATTHandle(GATT, 'ca88c58fd616fd9a224ec7f7c985437a', 'ce738dd2c771a8a0b24b6e3372fc5412')// '0051'
  logger.info({ log: chrConfigIO }, `[${devHandle.node}]:chr handle`)

  const chrScanData = findCCCDHandle(GATT, 'f03c155f53d7b1acef4ef696b701b56c', 'a620150bfc5f78ba134671d8b8813ece')// '0043'
  logger.info({ log: chrScanData }, `[${devHandle.node}]:chr handle`)

  if (chrConfigIO.length > 0 && chrScanData.length > 0) {
    const ret7a = await devHandle.write({ sh: chrConfigIO[0].sh, value: '03ae07' })
    logger.info({ log: ret7a }, `[${devHandle.node}]:write config`)

    const ret8a = await devHandle.subscribeIndicationDirect(chrScanData[0], dataHandlerD600)
    logger.info({ log: ret8a }, `[${devHandle.node}]:subscribeIndication`)
  }
}

async function S550ReaderdeviceHandler (devHandle) {
  let GATT = []
  logger.info({ log: devHandle.node }, `[${devHandle.node}]:Connected`)
  if (!nconf.get('GATT:S550READER')) {
    GATT = await discoverGATTtable(devHandle, 3)
    if (!nconf.get('GATT:S550READER')) {
      nconf.set('GATT:S550READER', GATT)
      nconf.save(function (err) {
        if (err) {
          logger.info({ log: err }, 'nconf save error 1')
        }
      })
    }
  } else {
    GATT = nconf.get('GATT:S550READER')
  }

  logger.info({ log: GATT }, `[${devHandle.node}]:GATT`)

  const chrRes = findCCCDHandle(GATT, 'ca88c58fd616fd9a224ec7f7c985437a', 'd667dc6c6a048c99e44e0ffd3f2d3894')// 0056
  logger.info({ log: chrRes }, `[${devHandle.node}]:chr res handle`)
  if (chrRes.length > 0) {
    const ret7a = await devHandle.subscribeIndicationDirect(chrRes[0], dataHandler)
    logger.info({ log: ret7a }, `[${devHandle.node}]:subscribeIndication`)
  }

  const chrEvt = findCCCDHandle(GATT, 'ca88c58fd616fd9a224ec7f7c985437a', '520503447954f7ba8b4f04e69639d323')// 0059
  logger.info({ log: chrEvt }, `[${devHandle.node}]:chr evt handle`)
  if (chrEvt.length > 0) {
    const ret8a = await devHandle.subscribeIndicationDirect(chrEvt[0], dataHandlerS550)
    logger.info({ log: ret8a }, `[${devHandle.node}]:subscribeIndication`)
  }
}

function findGATTHandle (GATT, suuid, cuuid) {
  const chr = []
  GATT.forEach(service => {
    if (service.uuid == suuid) {
      service.characteristics.forEach(characteristics => {
        if (characteristics.uuid == cuuid) {
          chr.push(characteristics)
        }
      })
    }
  })
  return (chr)
}

function findCCCDHandle (GATT, suuid, cuuid) {
  const chr = []
  const chrCCCD = []
  GATT.forEach(service => {
    if (service.uuid == suuid) {
      service.characteristics.forEach(characteristics => {
        if (characteristics.uuid == cuuid) {
          chr.push(characteristics)
        }
      })
    }
  })
  chr.forEach(charc => {
    charc.descriptors.forEach(des => {
      if (des.uuid == '0229') {
        chrCCCD.push({ csh: charc.sh, sh: des.sh })
      }
    })
  })
  return (chrCCCD)
}

async function discoverGATTtable (devHandle, level = 2) {
  const GATT = []
  const srvList = await devHandle.services()
  logger.info({ log: srvList }, `[${devHandle.node}]:Services`)
  for (let i = 0; i < srvList.services.length; i++) {
    GATT[i] = Object.assign({}, srvList.services[i], { characteristics: [] })
    logger.info({ log: srvList.services[i] }, `[${devHandle.node}]:Service`)
    const charList = await devHandle.characteristics(srvList.services[i])
    logger.info({ log: charList }, `[${devHandle.node}]:characteristics`)
    for (let j = 0; j < charList.characteristics.length; j++) {
      if (level > 2) {
        const desList = await devHandle.descriptors(charList.characteristics[j])
        GATT[i].characteristics.push(Object.assign({}, charList.characteristics[j], { descriptors: desList.descriptors }))
      } else {
        GATT[i].characteristics.push(Object.assign({}, charList.characteristics[j]))
      }
    }
    // charList.characteristics.forEach(char => {
    //    let des = await axmDev.descriptors(char2.characteristics[0])
    //    GATT[i].characteristics.push(Object.assign({}, char))
    // })
  }
  return (GATT)
}

function dataHandler (devHandle, msgData) {
  logger.info({ log: msgData }, `[${devHandle.node}]:dataHandler`)
}

function dataHandlerS550 (devHandle, msgData) {
  logger.info({ log: msgData }, `[${devHandle.node}]:S550dataHandler`)

  const sc2b = scUtils.parseFrame(msgData.value, devHandle.node)
  if (sc2b) {
    const sc2bd = scUtils.decode(sc2b)
    console.log(sc2bd)
  }
}

function dataHandlerD600 (devHandle, msgData) {
  logger.info({ log: msgData }, `[${devHandle.node}]:dataHandlerD600`)

  const sc2b = d600Utils.parseFrame(msgData.value, devHandle.node)
  if (sc2b) {
    const sc2bd = d600Utils.decode(sc2b)
    console.log(sc2bd)
  }
}

async function bleScanEventHandler (linkHandle, gwid, scanEventData) {
  logger.info({ log: scanEventData }, `[${gwid}]:bleScanEventHandler`)
}

// Adv matching filters
const axAdvMatchS550 = advItem => (advItem.sUUID == 'ca88c58fd616fd9a224ec7f7c985437a')
const axAdvMatchD600Bonded = advItem => (advItem.sUUID == 'f03c155f53d7b1acef4ef696b701b56c')
const axAdvMatchD600Unbonded = advItem => (advItem.sUUID == '3cf0155f53d7b1acef4ef696b701b56c')
const axAdvMatchAXM = advItem => ((advItem.name.length == 10) && (advItem.name.slice(0, 4) == 'AXMS'))

/**
 * Function to extract advertisement data
 *
 * @param {Object} advItem - Single advertisement object
 * @returns {Object} advObj - Single parsed advertisement data object
 */
function axAdvExtractData (advItem) {
  const advObj = Object.assign({}, advItem, {
    name: axParseAdvGetName(advItem.adv, advItem.rsp), // BLE device name
    sUUID: axParseAdvServiceUUID(advItem.adv, advItem.rsp) // service UUID
  })
  logger.trace(`ADV: ${JSON.stringify(advObj)}`)
  return advObj
}

/**
 * Get device name from advertisement packet
 *
 * @param {Object} adv - Advertisement payload
 * @param {Object} rsp - Scan response payload
 * @returns {string} - Name of the device or null if not present
 */
function axParseAdvGetName (adv, rsp) {
  var didName = '';
  [adv, rsp].forEach(advSegment => {
    advSegment.forEach(item => {
      if (item.t == 8 || item.t == 9) {
        didName = item.v
      }
    })
  })
  return didName
}

/**
 * Get service UUID from advertisement packet
 *
 * @param {Object} adv - Advertisement payload
 * @param {Object} rsp - Scan response payload
 * @returns [string] - Array of service UUID in hextstr format(lowercase) the device or null if not present
 */
function axParseAdvServiceUUID (adv, rsp) {
  const SerrviceUUID = [];
  [adv, rsp].forEach(advSegment => {
    advSegment.forEach(item => {
      if (item.t > 1 && item.t < 8) {
        item.v.forEach(value => SerrviceUUID.push(value))
      }
    })
  })
  return SerrviceUUID
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
