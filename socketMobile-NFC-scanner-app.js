/*
 * SocketMobile S550 and D600 NFC scanner applications
 *
 * Copyright(C) 2020 Axiomware Systems, Inc.
 * 
 * See LICENSE for more information
 */

'use strict'

const logger = require('pino')({level: process.env.LEVEL || 'info'}, process.stderr);
const minimist = require('minimist');
const nconf = require('nconf');
const gapiV3Lib = require("gapi-v3-sdk");
const d600ReaderLib = require('./lib/d600ReaderLib.js');
const springCoreLib = require('./lib/springCoreUtils.js');


process.stdin.resume();                                 //so the program will not close instantly

process.on('exit', function (err) {                     //On exit handler
    console.log('Goodbye!');
});

process.on('unhandledRejection', (reason, p) => {       //Unhandled promise rejections.
    console.log('Unhandled Rejection at: Promise', p);
    // application specific handling here
});

process.on('uncaughtException', (reason, p) => {        // Unhandled exceptions
    console.log(p, 'reason:', reason);
    // application specific handling here
});


let args = minimist(process.argv.slice(2), {
    string: ['host'],//MQTT broker IP addr
    string: ['port'],//MQTT broker port
    string: ['prefix'],//Topic prefix
    alias: { h: 'host', p: 'port', t: 'prefix'},
    default: {
        'host': '192.168.8.1',
        'port': '1883', 
        'prefix': 'netrunrfe/'
    }
})


// Store GATT cache info
nconf.file({ file: './config/config_gatt.json'});

nconf.load();


const d600Utils = new d600ReaderLib.d600Utils();        //Library for SocketMobile D600 Scanner
const scUtils = new springCoreLib.springCoreUtils();    //Library for SocketMobile S550 Scanner
var gHostFE = args['host'];
var gPortFE = args['port'];                      
var gOptionsFE = {
    username: "",
    password: ""
}; 

var gTopicPrefixFE = args['prefix']

const gNetrunrClient = new gapiV3Lib.gapiClient();                      
main();

async function main(){
    gNetrunrClient.on('heartbeat', gwHeartbeatHandler);
    var gClient = await gNetrunrClient.init(gHostFE, gPortFE, gOptionsFE, gTopicPrefixFE);
}

async function gwHeartbeatHandler(hbtData){
    logger.info({log: hbtData}, `[${hbtData.id}]:Heartbeat data`);
    if(!gNetrunrClient.getBleLinkStatus(hbtData.id)){
        let gwHandle = await gNetrunrClient.createBleLink(hbtData.id)
        logger.info({log: gwHandle.info}, `[${gwHandle.gwid}]:System Info`);
        gwHandle.on('create', bleLinkHandler);
        gwHandle.on('adv', bleAdvHandler);
        gwHandle.on('event:scan', bleScanEventHandler);   
    }
}

async function bleLinkHandler(linkHandle){
    linkHandle.defaultTimeout = 20000; //reduce timeout to 20 secs
    logger.info(`[${linkHandle.gwid}]:New Timeout: ${linkHandle.defaultTimeout}`);

    let ver =  await linkHandle.version();
    logger.info({log: ver}, `[${linkHandle.gwid}]:Version`);

    let ping =  await linkHandle.ping();
    logger.info({log: ping}, `[${linkHandle.gwid}]:ping`);

    let ret6a = await linkHandle.show(5000);
    logger.info({log: ret6a}, `[${linkHandle.gwid}]:show`);
    await sleep(5000);
   
    ret6a.nodes.forEach(async node => {
        let ret_discon = await linkHandle.disconnectNode(node)
        logger.info({log: ret_discon}, `[${linkHandle.gwid}]:disconnectNode`);
    })


    linkHandle.scanListen(true) //listen to background scan results

    let ret3 = await linkHandle.scanStart({active: false, period:5, filter:2, broadcast:true }, 5000);
    logger.info({log: ret3}, `[${linkHandle.gwid}]:scanStart`);
    await sleep(5000);
}


async function bleAdvHandler(linkHandle, gwid, advData){

    var advArrayMap = advData['nodes'].map(axAdvExtractData);//Extract data

    var D600UBadv = advArrayMap.filter(axAdvMatchD600Unbonded);//Filter adv for D600 without pairing feature
    var D600Badv = advArrayMap.filter(axAdvMatchD600Bonded);//Filter adv for D600 with pairing feature
    var S550adv = advArrayMap.filter(axAdvMatchS550);//Filter adv S550

    let connenctionParameters = {
        interval_min: 20, /* x1.25ms */
        interval_max: 50, /* x1.25ms */
        latency: 4,
        timeout: 1000, /* x10ms */
        wait: 15
        //att_mtu:
    };


    D600UBadv.forEach(node => {         //connect to all D600UB devices
        logger.info({log: node}, `[${gwid}]:adv D600UBadv`);
        linkHandle.connect(node, connenctionParameters, 20000).then((devHdl) => {
            if(devHdl.subcode ==0) {
                D600UnbondedDeviceHandler(devHdl)
            }
        })
    });

    D600Badv.forEach(node => {          //connect to all D600B devices
        logger.info({log: node}, `[${gwid}]:adv D600Badv`);
        linkHandle.connect(node, connenctionParameters, 20000).then((devHdl) => {
            if(devHdl.subcode ==0) {
                D600BondedDeviceHandler(devHdl)
            }
        })
    });

    S550adv.forEach(node => {           //connect to all S550 devices
        logger.info({log: node}, `[${gwid}]:adv S550adv`);
        linkHandle.connect(node, connenctionParameters, 20000).then((devHdl) => {
            if(devHdl.subcode ==0) {
                S550ReaderdeviceHandler(devHdl)
            }
        })
    });

}


async function D600UnbondedDeviceHandler(devHandle){
    let GATT = []
    logger.info({log: devHandle.node}, `[${devHandle.node}]:Connected`);
    if(!nconf.get('GATT:D600UNBONDED')) {           //check if cached copy of GATT table is available
        GATT = await discoverGATTtable(devHandle, 3);
        if(!nconf.get('GATT:D600UNBONDED')) {
            nconf.set('GATT:D600UNBONDED', GATT)
            nconf.save(function (err) {
                if (err) {
                    logger.info({log: err}, `nconf save error 1`);
                    return;
                }
            });
        }
    } else {
        GATT = nconf.get('GATT:D600UNBONDED');
    }
  
    logger.info({log: GATT}, `[${devHandle.node}]:GATT`);

    
    let chr_config_io = findGATTHandle(GATT, "88cac58fd616fd9a224ec7f7c985437a", "73ce8dd2c771a8a0b24b6e3372fc5412")//'0063'
    logger.info({log: chr_config_io}, `[${devHandle.node}]:chr handle`);

    let chr_scan_data = findCCCDHandle(GATT, "3cf0155f53d7b1acef4ef696b701b56c", "20a6150bfc5f78ba134671d8b8813ece")//'0055'
    logger.info({log: chr_scan_data}, `[${devHandle.node}]:chr handle`);
    if(chr_config_io.length>0 && chr_scan_data.length>0){

        let ret7a = await devHandle.write({sh: chr_config_io[0].sh, value: '03ae07'})
        logger.info({log: ret7a}, `[${devHandle.node}]:write config`);

        let ret8a = await devHandle.subscribeIndicationDirect(chr_scan_data[0], dataHandlerD600)
        logger.info({log: ret8a}, `[${devHandle.node}]:subscribeIndication`);
    }


}

async function D600BondedDeviceHandler(devHandle){
    let GATT = []
    logger.info({log: devHandle.node}, `[${devHandle.node}]:Connected`);
    if(!nconf.get('GATT:D600BONDED')) {
        GATT = await discoverGATTtable(devHandle, 3);
        if(!nconf.get('GATT:D600BONDED')) {
            nconf.set('GATT:D600BONDED', GATT)
            nconf.save(function (err) {
                if (err) {
                    logger.info({log: err}, `nconf save error 1`);
                    return;
                }
            });
        }
    } else {
        GATT = nconf.get('GATT:D600BONDED');
    }
  
    logger.info({log: GATT}, `[${devHandle.node}]:GATT   zzzzzzzzzzzzzzzzzzzzzzzzzzzz`);

    let iobj = {        //secure & pairing
        "iocap": 0,
        "oob": 0,
        "auth":  1,
        "key_max": 7,
        "key_value":"",
        "key_length":0,
        'init': 0x01,
        'resp': 0x01
    };
    
    try {
        let ret6a = await devHandle.pair(iobj)
        logger.info({log: ret6a}, `[${devHandle.node}]:Pair`);
    } catch (err) {
        logger.info({log: err}, `[${devHandle.node}]:Pair error`);
        return
    }
    let chr_config_io = findGATTHandle(GATT, "ca88c58fd616fd9a224ec7f7c985437a", "ce738dd2c771a8a0b24b6e3372fc5412")//'0051'
    logger.info({log: chr_config_io}, `[${devHandle.node}]:chr handle`);

    let chr_scan_data = findCCCDHandle(GATT, "f03c155f53d7b1acef4ef696b701b56c", "a620150bfc5f78ba134671d8b8813ece")//'0043'
    logger.info({log: chr_scan_data}, `[${devHandle.node}]:chr handle`);


    if(chr_config_io.length>0 && chr_scan_data.length>0){

        let ret7a = await devHandle.write({sh: chr_config_io[0].sh, value: '03ae07'})
        logger.info({log: ret7a}, `[${devHandle.node}]:write config`);

        let ret8a = await devHandle.subscribeIndicationDirect(chr_scan_data[0], dataHandlerD600)
        logger.info({log: ret8a}, `[${devHandle.node}]:subscribeIndication`);
    }


}

async function S550ReaderdeviceHandler(devHandle){
    let GATT = []
    logger.info({log: devHandle.node}, `[${devHandle.node}]:Connected`);
    if(!nconf.get('GATT:S550READER')) {
        GATT = await discoverGATTtable(devHandle, 3);
        if(!nconf.get('GATT:S550READER')) {
            nconf.set('GATT:S550READER', GATT)
            nconf.save(function (err) {
                if (err) {
                    logger.info({log: err}, `nconf save error 1`);
                    return;
                }
            });
        }
    } else {
        GATT = nconf.get('GATT:S550READER');
    }
  
    logger.info({log: GATT}, `[${devHandle.node}]:GATT`);

    let chr_res = findCCCDHandle(GATT, "ca88c58fd616fd9a224ec7f7c985437a", "d667dc6c6a048c99e44e0ffd3f2d3894")//0056
    logger.info({log: chr_res}, `[${devHandle.node}]:chr res handle`);
    if(chr_res.length>0){

        let ret7a = await devHandle.subscribeIndicationDirect(chr_res[0], dataHandler)
        logger.info({log: ret7a}, `[${devHandle.node}]:subscribeIndication`);  
    }

    let chr_evt = findCCCDHandle(GATT, "ca88c58fd616fd9a224ec7f7c985437a", "520503447954f7ba8b4f04e69639d323")//0059
    logger.info({log: chr_evt}, `[${devHandle.node}]:chr evt handle`);
    if(chr_evt.length>0){

        let ret8a = await devHandle.subscribeIndicationDirect(chr_evt[0], dataHandlerS550)
        logger.info({log: ret8a}, `[${devHandle.node}]:subscribeIndication`);  
    }

}

function findGATTHandle(GATT, suuid, cuuid){
    let chr = []
    GATT.forEach(service => {
        if(service.uuid == suuid) {
            service.characteristics.forEach(characteristics => {
                if(characteristics.uuid == cuuid){
                    chr.push(characteristics)
                }
            })
        }
    })
    return(chr)
}

function findCCCDHandle(GATT, suuid, cuuid){
    let chr = []
    let chr_cccd = []
    GATT.forEach(service => {
        if(service.uuid == suuid) {
            service.characteristics.forEach(characteristics => {
                if(characteristics.uuid == cuuid){
                    chr.push(characteristics)
                }
            })
        }
    })
    chr.forEach(charc => {
        charc.descriptors.forEach(des => {
            if(des['uuid'] == '0229'){
                chr_cccd.push({csh: charc.sh, sh:des.sh})
            }
        })
    })
    return(chr_cccd)
}

async function discoverGATTtable(devHandle, level=2){
    let GATT = [];
    let srvList = await devHandle.services();
    logger.info({log: srvList}, `[${devHandle.node}]:Services`);
    for (let i = 0; i < srvList.services.length; i++) {
        GATT[i] = Object.assign({}, srvList.services[i], {characteristics:[]})
        logger.info({log: srvList.services[i]}, `[${devHandle.node}]:Service`);
        let charList = await devHandle.characteristics(srvList.services[i])
        logger.info({log: charList}, `[${devHandle.node}]:characteristics`);
        for (let j = 0; j < charList.characteristics.length; j++){
            if(level > 2) {
                let desList = await devHandle.descriptors(charList.characteristics[j])
                GATT[i].characteristics.push(Object.assign({}, charList.characteristics[j], {descriptors: desList.descriptors}))
            } else {
                GATT[i].characteristics.push(Object.assign({}, charList.characteristics[j]))
            }
        }
        //charList.characteristics.forEach(char => {
        //    let des = await axmDev.descriptors(char2.characteristics[0])
        //    GATT[i].characteristics.push(Object.assign({}, char))
        //})
    }
    return(GATT)
}

function dataHandler(devHandle, msgData){
    logger.info({log: msgData}, `[${devHandle.node}]:dataHandler`);
}

function dataHandlerS550(devHandle, msgData){
    logger.info({log: msgData}, `[${devHandle.node}]:S550dataHandler`);

    let sc2b= scUtils.parseFrame(msgData['value'], devHandle.node)
    if(sc2b){
        let sc2bd = scUtils.decode(sc2b)
        console.log(sc2bd)
    } 
    return
}

function dataHandlerD600(devHandle, msgData){
    logger.info({log: msgData}, `[${devHandle.node}]:dataHandlerD600`);

    let sc2b= d600Utils.parseFrame(msgData['value'], devHandle.node)
    if(sc2b){
        let sc2bd = d600Utils.decode(sc2b)
        console.log(sc2bd)
    } 
    return
}

async function bleScanEventHandler(linkHandle, gwid, scanEventData){
    logger.info({log: scanEventData}, `[${gwid}]:bleScanEventHandler`);
}

//Adv matching filters
const axAdvMatchS550 = advItem => (advItem.sUUID == "ca88c58fd616fd9a224ec7f7c985437a")
const axAdvMatchD600Bonded = advItem => (advItem.sUUID == "f03c155f53d7b1acef4ef696b701b56c")
const axAdvMatchD600Unbonded = advItem => (advItem.sUUID == "3cf0155f53d7b1acef4ef696b701b56c")
const axAdvMatchAXM = advItem => ((advItem.name.length == 10) && (advItem.name.slice(0, 4) == 'AXMS'))

/**
 * Function to extract advertisement data
 * 
 * @param {Object} advItem - Single advertisement object
 * @returns {Object} advObj - Single parsed advertisement data object
 */
function axAdvExtractData(advItem) {
    let advObj = Object.assign({}, advItem, {
        name: axParseAdvGetName(advItem.adv, advItem.rsp),  //BLE device name
        sUUID: axParseAdvServiceUUID(advItem.adv, advItem.rsp),  //service UUID
    })
    logger.trace(`ADV: ${JSON.stringify(advObj)}`);
    return advObj;
}

/**
 * Get device name from advertisement packet
 * 
 * @param {Object} adv - Advertisement payload
 * @param {Object} rsp - Scan response payload
 * @returns {string} - Name of the device or null if not present
 */
function axParseAdvGetName(adv, rsp) {
    var didName = '';
    [adv, rsp].forEach(advSegment => {
        advSegment.forEach(item => {
            if(item['t'] == 8 || item['t'] == 9) {
                didName =  item['v']
            }
        })
    })
    return didName;
}

/**
 * Get service UUID from advertisement packet
 * 
 * @param {Object} adv - Advertisement payload
 * @param {Object} rsp - Scan response payload
 * @returns [string] - Array of service UUID in hextstr format(lowercase) the device or null if not present
 */
function axParseAdvServiceUUID(adv, rsp) {
    let SerrviceUUID = [];
    [adv, rsp].forEach(advSegment => {
        advSegment.forEach(item => {
            if(item['t'] > 1 && item['t'] < 8) {
                item['v'].forEach(value => SerrviceUUID.push(value))
            }
        })
    })
    return SerrviceUUID;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}




