let whiteBgCoins = ['snw', 'ltc'];

function switchCoin(dom, hover) {
  const walletBg = document.querySelectorAll(".wallet-card-bg");

  for(let i = 0; i < walletBg.length; i++) {
    walletBg[i].classList = 'wallet-card-bg wallet-card-disabled';

    dom.classList = 'wallet-card-bg';

    if(walletBg[i].classList.value.includes('wallet-card-disabled') == true && whiteBgCoins.includes(walletBg[i].id)) {
      const selectedImg = walletBg[i].querySelectorAll(`#${walletBg[i].id}`);

      for(let j = 0; j < selectedImg.length; j++) { selectedImg[j].src = `images/coins/${walletBg[i].id}.png` }
    } else if(whiteBgCoins.includes(walletBg[i].id)) {
      const selectedImg = walletBg[i].querySelectorAll(`#${walletBg[i].id}`);

      for(let j = 0; j < selectedImg.length; j++) { selectedImg[j].src = `images/coins/${walletBg[i].id}_white.png` }
    }
  }
}



function hoverCoin(dom, type) {
  if(whiteBgCoins.includes(dom.id)) {
    if(dom.classList.value.includes('wallet-card-disabled')) {
      if(type) {
        const selectedImg = dom.querySelectorAll(`#${dom.id}`);
        for(let i = 0; i < selectedImg.length; i++) { selectedImg[i].src = `images/coins/${dom.id}_white.png` }
      } else {
        const selectedImg = dom.querySelectorAll(`#${dom.id}`);
        for(let i = 0; i < selectedImg.length; i++) { selectedImg[i].src = `images/coins/${dom.id}.png` }
      }
    }
  }
}