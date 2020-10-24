/*
 * SocketMobile D600 NFC Reader Library
 *
 * Copyright(C) 2020 Axiomware Systems, Inc..
 *
 * See LICENSE for more information
 */

'use strict'

const nodeIDdefault = '0' // default node ID
/**
 * Class to parse and assemble multi-segment NFC data from SocketMobile D600 Scanner
 */
class D600Utils {
  constructor () {
    this._indicationData = {}// per node indication data
  }

  /**
     * @param  {string} node Use this tag to keep track of partial data from multiple sources
     */
  clearData (node = nodeIDdefault) {
    if (node in this._indicationData) {
      delete this._indicationData[node]
    }
  }

  /**
     * @param  {string} hexStrData Hex string of input data. Data can be partial
     * @param  {string} node Use this tag to keep track of partial data from multiple sources
     */
  parseFrame (hexStrData, node = nodeIDdefault) { // pass indication with device ID. Indication will be accumalated till '00'
    if (this._isHexStr(hexStrData)) {
      this._addData(hexStrData, node)

      if (this._EOF(node)) {
        const hexStr = this._getData(node)
        const cardTypeStr = Buffer.from(hexStr.slice(0, 4), 'hex').toString('utf8')
        this.clearData(node)
        return { header: cardTypeStr, payload: hexStr.slice(4, -2) }
      } else {

      }
    } else {
      throw new Error('Input data is not hex string')
    }
  }

  /**
     * @param  {Object} parsedFrame
     */
  decode (parsedFrame) {
    let ct = null
    let outStr = null
    let utf8decodeFlag = false
    if (parsedFrame.header) {
      let CtStr = parsedFrame.header.slice(0, 2)
      if (CtStr === 'ht') { // starts with URL
        CtStr = '4F'
      }
      const cType = parseInt(CtStr, 16)// first two chars denote card type or url

      if (cardTypeMap.has(cType)) {
        ct = cardTypeMap.get(cType).cardType
        utf8decodeFlag = cardTypeMap.get(cType).utf8
      } else {
        ct = `Unknown type[${CtStr}]`
      }
    }
    if (parsedFrame.payload && utf8decodeFlag) {
      outStr = Buffer.from(parsedFrame.payload, 'hex').toString('utf8')
    } else {
      outStr = parsedFrame.payload
    }
    return { cardType: ct, utf8: utf8decodeFlag, cardData: outStr }
  }

  /**
     *
     * @param {*} hexStr
     * @param {*} node
     */
  _addData (hexStr, node = nodeIDdefault) {
    if (node in this._indicationData) {
      this._indicationData[node] += hexStr
    } else {
      this._indicationData[node] = hexStr
    }
  }

  _getData (node = nodeIDdefault) {
    if (node in this._indicationData) {
      return this._indicationData[node]
    } else {

    }
  }

  _EOF (node = nodeIDdefault) {
    if ((node in this._indicationData) && (this._indicationData[node].slice(-2) === '00')) { return true } else { return false }
  }

  _isHexStr (str) {
    const regexp = /^[0-9a-fA-F]+$/
    return regexp.test(str)
  }
}

const cardTypeMap = new Map([
  [0x01, { cardType: 'NFC-A (ISO/IEC 14443-A)', utf8: false }],
  [0x02, { cardType: 'NFC-B (ISO/IEC 14443-B)', utf8: false }],
  [0x03, { cardType: 'NFC-Felica', utf8: false }],
  [0x04, { cardType: 'NFC-V (ISO/IEC 15693, ISO/IEC 18000-3M1)', utf8: false }],
  [0x08, { cardType: 'NXP ICODE1', utf8: false }],
  [0x10, { cardType: 'Inside Secure Picopass/Picotag', utf8: false }],
  [0x11, { cardType: 'Broadcom / Innovision Jewels / Topaz', utf8: false }],
  [0x14, { cardType: 'EM MicroElectronic 4134', utf8: false }],
  [0x18, { cardType: 'ThinFilm / Kovio RF Barcode', utf8: false }],
  [0x20, { cardType: 'ST MicroElectronics Short Range', utf8: false }],
  [0x34, { cardType: 'ISO/IEC 18000-3M3 / EPC Class 1 Gen2 HF', utf8: false }],
  [0x40, { cardType: 'ASK (now Paragon ID) contactless tickets B', utf8: false }],
  [0x4F, { cardType: 'NFC Forum', utf8: true }],
  [0x80, { cardType: 'Innovatron 14443-B', utf8: false }]
])

module.exports = {
  D600Utils: D600Utils
}
