const siphash = require('siphash');

let key = siphash.string16_to_key("This is the key!");
let message = "Short test message";
let hash_hex = siphash.hash_hex(key, message);

console.log(hash_hex);

const WB = require('turtlecoin-wallet-backend');

(async () => {
    const daemon = new WB.Daemon('127.0.0.1', 22101);

    const wallet = WB.WalletBackend.createWallet(daemon);

    console.log('Created wallet');

    await wallet.start();

    console.log('Started wallet');

    wallet.saveWalletToFile('mywallet.wallet', 'hunter2');

    /* Make sure to call stop to let the node process exit */
    wallet.stop();
})().catch(err => {
    console.log('Caught promise rejection: ' + err);
});