/*
 * Data test of SocketMobile D600 NFC Reader Library
 *
 * Copyright(C) 2020 Axiomware Systems, Inc..
 *
 * See LICENSE for more information
 *
 * To run this example(no hardware required):
 * npm install
 * node d600-data-test.js
 *
 * D600 and S550 are products from SocketMobile - https://www.socketmobile.com/
 * SpringCore documentaion : https://docs.springcard.com/books/SpringCore/Welcome
 *
 */

'use strict'

const d600ReaderLib = require('./lib/d600ReaderLib.js')

const d600Utils = new d600ReaderLib.d600Utils()

// d600 - short NFC read example 1
var str1a = '344673742e636f6d2f6e66632d7266696400'

var s1 = d600Utils.parseFrame(str1a)
if (s1) { // print if complete frame
  var s1d = d600Utils.decode(s1)
  console.log('------EXAMPLE 1------------------------------------------------')
  console.log(s1)
  console.log(s1d)
}

// d600 - short NFC read example 2
var str2a = '3446687474703a2f2f746167732e737072696e67636172642e636f6d2f7569642f30344331363830324338343038302f737072696e676669656c642d666c6f7269646100'

var s2 = d600Utils.parseFrame(str2a)
if (s2) { // print if complete frame
  var s2d = d600Utils.decode(s2)
  console.log('------EXAMPLE 2------------------------------------------------')
  console.log(s2)
  console.log(s2d)
}

// d600 - multi-segment NFC read example 3
var str3a = '34462122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7ec2a0c2a1c2a2c2a3c2a4c2a5c2a6c2a7c2a8c2a9c2aac2abc2acc2aec2afc2b0c2b1c2b2c2b3c2b4c2b5c2b6c2b7c2b8c2b9c2bac2bbc2bcc2bdc2bec2bfc380c381c382c383c384c385c386c387c388c389c38ac38bc38cc38dc38ec38fc390c391c392c393c394c395c396c397c398c399c39ac39bc39cc39dc39ec39fc3a0c3a1c3a2c3a3c3a4c3a5c3a6c3a7c3a8c3a9c3aa'
var str3b = 'c3abc3acc3adc3aec3afc3b0c3b1c3b2c3b3c3b4c3b5c3b6c3b7c3b8c3b9c3bac3bbc3bcc3bdc3bec3bfc482c483c484c485c486c487c48cc48dc48ec48fc490c491c498c499c49ac49bc4b9c4bac4bdc4bec581c582c583c584c587c588c590c591c592c593c594c595c598c599c59ac59bc59ec59fc5a0c5a1c5a2c5a3c5a4c5a5c5aec5afc5b0c5b1c5b8c5b9c5bac5bbc5bcc5bdc5bec692cb86cb87cb98cb99cb9bcb9ccb9de28093e28094e28098e28099e2809ae2809ce2809de2809ee280a0e280a1e280a2e280a6e280b0e280b9e280bae282ace284a20a0ac2a00a0a2122232425262728292a2b2c2d2e2f30313233'
var str3c = '3435363738393a3b3c3d3e3f404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7ec2a0c2a1c2a2c2a3c2a4c2a5c2a6c2a7c2a8c2a9c2aac2abc2acc2aec2afc2b0c2b1c2b2c2b3c2b4c2b5c2b6c2b7c2b8c2b9c2bac2bbc2bcc2bdc2bec2bfc380c381c382c383c384c385c386c387c388c389c38ac38bc38cc38dc38ec38fc390c391c392c393c394c395c396c397c398c399c39ac39bc39cc39dc39ec39fc3a0c3a1c3a2c3a3c3a4c3a5c3a6c3a7c3a8c3a9c3aac3abc3acc3adc3aec3afc3b0c3b1c3b2c3b3c3b4c3'
var str3d = 'b5c3b6c3b7c3b8c3b9c3bac3bbc3bcc3bdc3bec3bfc482c483c484c485c486c487c48cc48dc48ec48fc490c491c498c499c49ac49bc4b9c4bac4bdc4bec581c582c583c584c587c588c590c591c592c593c594c595c598c599c59ac59bc59ec59fc5a0c5a1c5a2c5a3c5a4c5a5c5aec5afc5b0c5b1c5b8c5b9c5bac5bbc5bcc5bdc5bec692cb86cb87cb98cb99cb9bcb9ccb9de28093e28094e28098e28099e2809ae2809ce2809de2809ee280a0e280a1e280a2e280a6e280b0e280b9e280bae282ace284a200'

var s3a = d600Utils.parseFrame(str3a)
if (s3a) { // print if complete frame
  var s3ad = d600Utils.decode(s3a)
  console.log('------EXAMPLE 3a------------------------------------------------')
  console.log(s3a)
  console.log(s3ad)
}
var s3b = d600Utils.parseFrame(str3b)
if (s3b) { // print if complete frame
  var s3bd = d600Utils.decode(s3b)
  console.log('------EXAMPLE 3b------------------------------------------------')
  console.log(s3b)
  console.log(s3bd)
}
var s3c = d600Utils.parseFrame(str3c)
if (s3c) { // print if complete frame
  var s3cd = d600Utils.decode(s3c)
  console.log('------EXAMPLE 3c------------------------------------------------')
  console.log(s3c)
  console.log(s3cd)
}
var s3d = d600Utils.parseFrame(str3d)
if (s3d) { // print if complete frame
  var s3dd = d600Utils.decode(s3d)
  console.log('------EXAMPLE 3d------------------------------------------------')
  console.log(s3d)
  console.log(s3dd)
}
