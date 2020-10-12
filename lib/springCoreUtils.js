/*
 * SocketMobile S550 NFC Reader Library
 *
 * Copyright(C) 2020 Axiomware Systems, Inc.
 *
 * See LICENSE for more information
 */

'use strict'

const nodeIDdefault = '0' // default node ID

class SpringCoreUtils {
  constructor () {
    this._indicationData = {}// per node indication data
  }

  clearData (node = nodeIDdefault) {
    if (node in this._indicationData) {
      delete this._indicationData[node]
    }
  }

  parseFrame (hexStrData, node = nodeIDdefault) { // pass indication with device ID. Indication will be accumalated till '00'
    if (this._isHexStr(hexStrData)) {
      const ret = {}
      this._addData(hexStrData, node)

      const pObj = this._parseHeader(node)

      if (!pObj) { return }

      const header = pObj.header
      const payload = pObj.payload
      const dobj = this._parse(payload, header.len)

      ret.header = header
      /* Error, or partial data (call again with next data chunk) */
      if (!dobj) { return }

      dobj.forEach((tlv) => {
        switch (tlv.T) {
          case 0x85:
            ret['85'] = Buffer.from(tlv.V, 'hex').toString('hex')
            break
          case 0xC0:
            ret.C0 = Buffer.from(tlv.V, 'hex').toString('hex')
            break
          case 0xC1:
            ret.C1 = Buffer.from(tlv.V, 'hex').toString('hex')
            break
          case 0xC2:
            ret.C2 = Buffer.from(tlv.V, 'hex').toString('hex')
            break
          case 0xC3:
            ret.C3 = Buffer.from(tlv.V, 'hex').toString('hex')
            break
          case 0xC4:
            ret.C4 = Buffer.from(tlv.V, 'hex').toString('hex')
            break
          default:
            throw new Error(`unknown tag type[0x${tlv.T.toString(16)}]`)
        }
      })
      this.clearData(node)
      return ret
    } else {
      throw new Error('Input data is not hex string')
    }
  }

  decode (parsedFrame) {
    let ret = {}
    if (parsedFrame.header) {
      ret = Object.assign(ret, this._getHeaderDetails(parsedFrame.header))
    }
    if (parsedFrame['85']) {
      ret['85'] = parsedFrame['85']
    }
    if (parsedFrame.C0) {
      ret.C0 = parsedFrame.C0
    }
    if (parsedFrame.C1) {
      ret = Object.assign(ret, this._getTagInfoDetails(parsedFrame.C1))
    }
    if (parsedFrame.C2) {
      ret.C2 = parsedFrame.C2
    }
    if (parsedFrame.C3) {
      if (ret.dataUTF8) {
        ret.C3 = Buffer.from(parsedFrame.C3, 'hex').toString('utf8')
      } else {
        ret.C3 = parsedFrame.C3
      }
    }
    if (parsedFrame.C4) {
      if (ret.detailsUTF8) {
        ret.C4 = Buffer.from(parsedFrame.C4, 'hex').toString('utf8')
      } else {
        ret.C4 = parsedFrame.C4
      }
    }
    return ret
  }

  /* internal functions */

  _addData (hexStr, node = nodeIDdefault) {
    const newData = Buffer.from(hexStr, 'hex')
    if (node in this._indicationData) {
      this._indicationData[node].push(newData)
    } else {
      this._indicationData[node] = [newData]
    }
  }

  _getData (node = nodeIDdefault) {
    if (node in this._indicationData) {
      return Buffer.concat(this._indicationData[node])
    } else {

    }
  }

  /* helper functions */
    _isWayHost = pcb => (pcb & 0x80) ?  1 : 0
    _isChannelInterrupt = pcb => (pcb & 0x40) ? 1 : 0
    _isSecure = pcb => (pcb & 0x20) ? 1 : 0
    _isHeaderLong = pcb => (pcb & 0x10) ? 1 : 0
    _getSequence = pcb => pcb & 0x0f

  _getHeaderDetails (header) {
    return {
      way: this._isWayHost(header.pcb),
      ch: this._isChannelInterrupt(header.pcb),
      secure: this._isSecure(header.pcb),
      seq: this._getSequence(header.pcb),
      cla: classMap.get(header.cla),
      len: header.len,
      evt: eventMap.get(header.evt)
    }
  }

  _getTagInfoDetails (tagInfoHexStr) {
    if (!this._isHexStr(tagInfoHexStr)) { throw new Error('Input data is not hex string') }
    const tagInfoBuf = Buffer.from(tagInfoHexStr, 'hex')

    if (tagInfoBuf.byteLength !== 4) { throw new Error(`tag Info is not 4 bytes[${tagInfoBuf.byteLength}]`) }

    const ifmap = interfaceIDMap.get(tagInfoBuf[1])
    if (!ifmap) { throw new Error('tag Info does not have Interface ID') }
    const protocolmap = ifmap.protocolMap
    return {
      new: !!((tagInfoBuf[0] & 0x80)),
      dataUTF8: !!((tagInfoBuf[0] & 0x20)),
      detailsUTF8: !!((tagInfoBuf[0] & 0x10)),
      interface: ifmap.desc,
      protocol: protocolmap.get(tagInfoBuf[2]),
      template: tagInfoBuf[3]
    }
  }

  _parseHeader (node = nodeIDdefault) {
    const data = this._getData(node)
    if (!data || data.byteLength < 4) { return }

    var pcb = data[0]
    var cla = data[1]

    var len = 0
    var payload = null
    var evt
    if (this._isHeaderLong(pcb)) {
      if (data.byteLength < 6) { throw new Error(`Header too short[${data.byteLength}]`) }
      len = data.readInt32BE(2)
      evt = data[6]
      payload = data.slice(7)
    } else {
      len = data.readInt16BE(2)
      evt = data[4]
      payload = data.slice(5)
    }

    var header = {
      pcb: pcb,
      cla: cla,
      len: len,
      evt: evt
    }
    return { header: header, payload: payload }
  }

  _parse (data, expectedLen) {
    if (!data || data.byteLength < 1) {
      return
    }

    if (data.byteLength !== expectedLen) {
      return
    }

    var TLV = []
    let i = 0
    let T = 0
    let L = 0
    let V = null
    while (i < data.byteLength) {
      if (tagTypesMap.has(data[i])) {
        T = data[i++]// Type
        if (data[i] < 0x80) { // Variable length field
          L = data[i]
          i = i + 1
        } else if (data[i] === 0x81) {
          L = data.readIntBE(++i, 1)
          i = i + 1
        } else if (data[i] === 0x82) {
          L = data.readIntBE(++i, 2)
          i = i + 2
        } else if (data[i] === 0x83) {
          L = data.readIntBE(++i, 3)
          i = i + 3
        } else if (data[i] === 0x84) {
          L = data.readIntBE(++i, 4)
          i = i + 4
        } else {
          throw new Error(`unknown tag type[0x${data[i].toString(16)}]`)
        }
        V = data.slice(i, i + L)// value
        TLV.push({ T, L, V })
        i = i + L
      } else {
        throw new Error(`unknown tag type[0x${data[i].toString(16)}]`)
      }
    }
    return TLV
  }

  _isHexStr (str) {
    const regexp = /^[0-9a-fA-F]+$/
    return regexp.test(str)
  }
}

const tagTypesMap = new Map([
  [0x85, 'InterfaceAndProtocols'],
  [0xC0, 'TagIndex'],
  [0xC1, 'TagInfo'],
  [0xC2, 'TagId'],
  [0xC3, 'TagData'],
  [0xC4, 'TagDetails']
])

const classMap = new Map([
  [0x00, 'PROTOCOL'],
  [0x58, 'CONTROL'],
  [0x59, 'ATCRYPTO'],
  [0x5a, 'SAMAV'],
  [0x5b, 'READER'],
  [0x5d, 'DFR'],
  [0x5e, 'ECHO']
])

const eventMap = new Map([
  [0x8b, 'Reader starting/stopping'],
  [0xb0, 'Tag read'],
  [0xb1, 'Tag inserted/removed']
])

// Unknown protocol
const protocol00Map = new Map([
  [0x00, 'Unknown protocol']
])

// NFC/RFID HF
const protocol03Map = new Map([
  [0x01, 'NFC-A (ISO/IEC 14443-A)'],
  [0x02, 'NFC-B (ISO/IEC 14443-B)'],
  [0x03, 'NFC-Felica'],
  [0x04, 'NFC-V (ISO/IEC 15693, ISO/IEC 18000-3M1)'],
  [0x08, 'NXP ICODE1'],
  [0x10, 'Inside Secure Picopass/Picotag'],
  [0x11, 'Broadcom / Innovision Jewels / Topaz'],
  [0x14, 'EM MicroElectronic 4134'],
  [0x18, 'ThinFilm / Kovio RF Barcode'],
  [0x20, 'ST MicroElectronics Short Range'],
  [0x34, 'ISO/IEC 18000-3M3 / EPC Class 1 Gen2 HF'],
  [0x40, 'ASK (now Paragon ID) contactless tickets B'],
  [0x4F, 'NFC Forum'],
  [0x80, 'Innovatron 14443-B']
])

// NFC/RFID UHF
const protocol06Map = new Map([
  [0x03, 'ISO/IEC 18000-6C / EPC Class 1 Gen2 UHF']
])

// Bluetooth interface
const protocol84Map = new Map([
  [0x10, 'Generic BLE advertising object'],
  [0x11, 'iBeacon-compliant BLE advertising object'],
  [0x12, 'Eddystone-compliant BLE advertising object']
])

// Interface and supported protocols
const interfaceIDMap = new Map([
  [0x00, { desc: 'Unknown interface', protocolMap: protocol00Map }],
  [0x03, { desc: 'NFC/RFID HF interface (13.56MHz)', protocolMap: protocol03Map }],
  [0x06, { desc: 'RFID UHF interface (868MHz / 910MHz)', protocolMap: protocol06Map }],
  [0x84, { desc: 'Bluetooth interface', protocolMap: protocol84Map }]
])

module.exports = {
  SpringCoreUtils: SpringCoreUtils
}
