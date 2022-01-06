const { ipcRenderer } = require('electron');
/* const siphash = require("siphash")

let key = siphash.string16_to_key("2D3C40EF00000000");
let message = "TRANSACTION";
let hash_hex = siphash.hash_hex(key, message);
console.log(hash_hex); */

ipcRenderer.send('loadWallet');

/* Refresh balance and sync status every second */
setInterval(() => {
  ipcRenderer.send('updateBalance');
  ipcRenderer.send('getSyncStatus');
}, 1000)




ipcRenderer.on('getSyncStatus', (event, arg) => {
  console.log(arg);
})


// Get address
ipcRenderer.on('updateBalance', (event, arg) => {
  console.log('Balance updated!')
  document.getElementById('receiveAddress').innerHTML = arg.address;
  document.getElementById('unlockedBalance').innerHTML = arg.unlockedBalance + " SNW";
  document.getElementById('lockedBalance').innerHTML = arg.lockedBalance + " SNW";
})