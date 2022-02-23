/* const siphash = require("siphash")

let key = siphash.string16_to_key("2D3C40EF00000000");
let message = "TRANSACTION";
let hash_hex = siphash.hash_hex(key, message);
console.log(hash_hex); */
const crypto = require('crypto');
const { ipcRenderer } = require('electron');
const socket = io.connect('http://127.0.0.1:22103');
const secKey = crypto.randomBytes(20).toString('hex');

/* Minimizing animation and action */
$('#minWindow').on('click', function() {
  if ($('#body').css('opacity') == 0) $('#form').css('opacity', 1);
  else $('#body').css('opacity', 0);

  setTimeout(() => {
    ipcRenderer.send('minimize');
    $('#body').css('opacity', 1)
  }, 250);
});

/* Exit animation and action */
$('#closeWindow').on('click', function() {
  if ($('#body').css('opacity') == 0) $('#form').css('opacity', 1);
  else $('#body').css('opacity', 0);

  setTimeout(() => {
    socket.emit('exitApp', { key: secKey });
    ipcRenderer.postMessage('exit');
  }, 250);
});

/* Send security key to server */
socket.emit('getSecKey', {
  key: secKey
});

/* Socket on */
socket.on('getWalletAddress', data => {
  /* Get primary address */
  document.getElementById('receiveAddress').innerHTML = data.address;
});

/* Get address */
socket.on('getBalances', data => {
  document.getElementById('unlockedBalance').innerHTML = "<img src='images/logo_white.png' class='balanceLogo'><span style='margin-left:1px;'>" + data.unlockedBalance + " SNW</span>";
  document.getElementById('lockedBalance').innerHTML = "<img src='images/logo_white.png' class='balanceLogo2'>" + data.lockedBalance + " SNW";
});




/*ipcRenderer.on('getSyncStatus', (event, data) => {
  console.log(arg);
}); */