const { WorkerData, parentPort } = require('worker_threads');
const WB = require('turtlecoin-wallet-backend');
const { config } = require('process');
const fs = require('fs');

const Config = require('../config.js');
const WorkerMessages = require('../workerMessages')
const { Logger, setLogSeverity, Severity } = require('../logger');
const workerMessages = require('../workerMessages');

setLogSeverity(Severity.TRACE);
const logger = new Logger("WalletBackend");
const daemon = new WB.Daemon(Config.daemonHostname, Config.daemonPort);
let wallet;



parentPort.on('message', async ({ type, data }) => {
  logger.debug('WalletBackend | message :>> ', { type, data });

  switch (type) {
    /* Open the wallet file or create one if none exist */
    case WorkerMessages.OPEN_WALLET:
      await openWallet(data.walletFile);
      parentPort.postMessage({ type: WorkerMessages.OPENED_WALLET, data: {} });
      break;

    /* Get primary address */
    case WorkerMessages.GET_PRIMARY_ADDRESS:
      break;

    /* Save wallet file */
    case workerMessages.SAVE_WALLET:
      await saveWallet(data.walletFile);
      break;
  }
});



async function saveWallet(walletFile) {
  await wallet.saveWalletToFile(walletFile, '');
  logger.debug('message :>> ', "Wallet saved!");
  parentPort.postMessage({ type: WorkerMessages.CLOSE_APP, data: { } })
}

async function getBalance() {
  const [unlockedBalance, lockedBalance] = await wallet.getBalance();
  parentPort.postMessage({ type: WorkerMessages.GET_BALANCE, data: { unlockedBalance: unlockedBalance, lockedBalance: lockedBalance } })
}

async function getPrimaryAddress() {
  const address = await wallet.getPrimaryAddress();
  return address;
}

async function openWallet(walletFile) {
  try {
    if (fs.existsSync('./' + walletFile)) {
      /* Open wallet file without password */
      const [openedWallet, error] = WB.WalletBackend.openWalletFromFile(daemon, './' + walletFile, '');

      // Error on opening wallet
      if (error) {
        console.log('Failed to open wallet: ' + error.toString());
        return;
      }

      wallet = openedWallet;
    } else {
      /* Create wallet file without password */
      const newWallet = WB.WalletBackend.createWallet(daemon);
      newWallet.saveWalletToFile('./' + walletFile, '');

      wallet = newWallet;
    }
  } catch (err) {
    console.error(err)

    return;
  }
  wallet.setLogLevel(WB.LogLevel.DEBUG);

  /* Start wallet */
  await wallet.start();

  // console.log(wallet.getTransactions(0));

  /* Get primary address */
  let primaryAddress = await getPrimaryAddress(0);
  parentPort.postMessage({ type: WorkerMessages.GET_PRIMARY_ADDRESS, data: { address: primaryAddress } })
  
  /* Get balance */
  await getBalance();

  /* Event for getting new incomming transactions */
  wallet.on('incomingtx', async (transaction) => {
    await getBalance();
  });

  /* Event for getting new outgoing transactions */
  wallet.on('outgoingtx', async (transaction) => {
    await getBalance();
  });

  /* Log the sync status every 3 seconds */
  setInterval(() => {
    const [walletBlockCount, localDaemonBlockCount, networkBlockCount] = wallet.getSyncStatus();
    logger.debug(`Synced: ${walletBlockCount}/${localDaemonBlockCount}`);
  }, 3000);

  await wallet.reset(10940);
}