let Config = require('./config.js');

const fetch = require('node-fetch');
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

module.exports = {
  /* SFP API */
  sfp_api: async function (request, data) {
    if(data) {
      let response = await fetch(`${Config.sfpProtocol}://${Config.sfpHostname}:${Config.sfpPort}/${Config.sfpVersion}${request}`, {
        "method": "POST",
        "headers": {
          "Content-Type": "application/json"
        },
        "body": JSON.stringify(data)
      });
      return response.json();
    } else {
      let response = await fetch(`${Config.sfpProtocol}://${Config.sfpHostname}:${Config.sfpPort}/${Config.sfpVersion}${request}`);
      return response.json();
    }
  }
}