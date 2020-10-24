# SocketMobile NFC scanner apps for D600 and S550

This application will collect NFC scan data from [SocketMobile](https://www.socketmobile.com/products/contactless/socketscan/s550-Bluetooth-RFID-reader) D600 and S550 scanners. The scanners are interfaced to a [Netrunr Bluetooth Gateway](http://www.axiomware.com) and uses the [Gateway API V3 SDK](https://github.com/axiomware/gapi-v3-sdk-js.git).

This Program will illustrate the following API functions:
- Install and include the SDK in a NodeJS Program.
- Connect to a MQTT broker and collect heartbeat data.
- Connect to multiple Netrunr gateways and initiate scan process.
- Detect and connect to one or more D600 scanners with pairing/bonding functionality
- Detect and connect to one or more S550 scanners.
- Run continuous background scan for BLE advertisements.
- Manage data collection from multiple concurrent devices using event handlers.
- Verify the configuration of the gateway and MQTT broker.
- TLS support
- Use MQTT5 protocol `request/response` features
- Use MQTT5 protocol `correlationData` features

**This example uses promises and async/await functionality present in Nodejs version 8.+**.

## SDK, Documentation and examples
- [Netrunr Gateway API V3 Documentation](http://www.axiomware.com/apidocs/index.html)
- [Netrunr Gateway API V3 SDK](https://github.com/axiomware/gapi-v3-sdk-js.git)

## Requirements

- [Netrunr E24](https://www.axiomware.com/netrunr-e24-product/) gateway
- A D600 or S550 NFC scanner
- Nodejs (see [https://nodejs.org/en/](https://nodejs.org/en/) for download and installation instructions)
  - Nodejs version 8.x.x or higher is required due to the use of promises/async/await
- NPM (Node package manager - part of Nodejs)   
- Windows, MacOS or Linux computer with access to internet

## Installation

Clone the repo

`git clone https://github.com/axiomware/socket-mobile-nfc-scanner-app.git`

or download as zip file to a local directory and unzip.

Install all module dependencies by running the following command inside the directory

```bash
cd socket-mobile-nfc-scanner-app

npm install
```

## Optional customization before running the program
This example uses the default setup of the Netrunr gateway:
- The client computer is connected to the LAN port of Netrunr gateway
- The built-in MQTT broker is used and the IP address of the gateway is `192.168.8.1`
- The MQTT broker port is `1883`
- The MQTT topic prefix is `netrunrfe`

## Usage

Run the nodejs application to collect NFC scan indications:

`node socketMobile-NFC-scanner-app.js -h '192.168.8.1' -p 1883 -t 'netrunrfe'`

To force exit at any time, use:

`CTRL-C`  

## Usage with TLS

The `tls` flag will enable operation over MQTTS. This mode will use client certificates and collect data over secure link:

`node socketMobile-NFC-scanner-app.js -h 'yourmqtthostname.com' -p 8883 -t 'netrunrfe' --tls --ca-filename='./yourRootCA.pem' --key-filename='./your-private-key.pem.key' --crt-filename='./your-client-certificate.pem.crt'`

To force exit at any time, use:

`CTRL-C`  

## D600 and S550 Library tests

To test the D600 NFC scan library (no hardware required):

`node d600-data-test.js`

To test the S550 NFC scan library (no hardware required):

`node s550-data-test.js`

## Error conditions/Troubleshooting

- If the program fails with module not installed errors, make sure `npm Install` is run prior to connecting to Netrunr gateway.
- This program caches GATT table in the config directory. If the GATT table of the device has changed, delete the `config-gatt.json` file. This file will be regenerated after connecting to a new BLE device.
- If bond has been erased, security keys have to be erased on the gateway too (see `unpair` command)
- For security reasons, Clients connected to LAN ports of Netrunr gateway have limited access to upstream network.
- If you do not see any heartbeat activity, verify network connections and your configuration.
