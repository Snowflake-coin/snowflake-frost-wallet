async function currencyUpdate() {
  let coins = ['bitcoin'];
  let currency = 'eur';

  for (coin of coins) {
    await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd%2Ceur%2Cbtc`)
      .then(response => response.json())
      .then(data => {
        document.getElementById(`${coin}Price`).innerHTML = `$${data[coin][currency].toLocaleString("en-US")}`;
      });
  }
}

/* Refresh every 3 minutes */
setInterval(() => {
  currencyUpdate();
}, (3 *(60 * 1000)));

currencyUpdate();