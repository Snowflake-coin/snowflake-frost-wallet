/* const siphash = require("siphash")

let key = siphash.string16_to_key("2D3C40EF00000000");
let message = "TRANSACTION";
let hash_hex = siphash.hash_hex(key, message);
console.log(hash_hex); */

$('#minWindow').on('click', function() {
  if ($('#body').css('opacity') == 0) $('#form').css('opacity', 1);
  else $('#body').css('opacity', 0);

  setTimeout(() => {
    ipcRenderer.send('minimize');
    $('#body').css('opacity', 1)
  }, 250);
});


/* Load wallet */
ipcRenderer.send('loadWallet');

/* Get primary address */
ipcRenderer.on('getPrimaryAddress', (event, data) => {
  console.log(data);
  document.getElementById('receiveAddress').innerHTML = data.address;
});

// Get address
ipcRenderer.on('getBalances', (event, data) => {
  document.getElementById('unlockedBalance').innerHTML = "<img src='images/logo_white.png' class='balanceLogo'>" + data.unlockedBalance + " SNW";
  document.getElementById('lockedBalance').innerHTML = "<img src='images/logo_white.png' class='balanceLogo2'>" + data.lockedBalance + " SNW";
})








ipcRenderer.on('getSyncStatus', (event, data) => {
  console.log(arg);
})
