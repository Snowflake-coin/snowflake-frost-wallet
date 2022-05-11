function changeCreateTokenValue(dom) {
  /* If name is between 0 and 10 */
  if(dom.id == 'createTokenName') {
    if(dom.value.replace(/[^a-z0-9]/gi,'').length < 5) {
      dom.classList.add('createTokenInputTextRed');
    } else {
      dom.classList.remove('createTokenInputTextRed')
    }
  }

  /* If name is between 0 and 10 */
  if(dom.id == 'createTokenTicker') {
    if(dom.value.replace(/[^a-z0-9]/gi,'').length < 3) {
      dom.classList.add('createTokenInputTextRed');
    } else {
      dom.classList.remove('createTokenInputTextRed')
    }
  }

  /* If decimals is between 0 and 10 */
  if(dom.id == 'createTokenDecimals') {
    if(parseInt(dom.value) >= 0 && parseInt(dom.value) <= 10) {
      dom.classList.remove('createTokenInputTextRed');
    } else {
      dom.classList.add('createTokenInputTextRed');
    }
  }
  
  /* If token supply is between 1 and 10000000000 */
  if(dom.id == 'createTokenSupply') {
    if(parseInt(dom.value) >= 1 && parseInt(dom.value) <= 10000000000) {
      dom.classList.remove('createTokenInputTextRed');
    } else {
      dom.classList.add('createTokenInputTextRed');
    }
  }

  /* Remove if field is empty */
  if(dom.value == "") {
    dom.classList.remove('createTokenInputTextRed');
  }
}