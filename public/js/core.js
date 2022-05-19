/* Convert timestamp to month and day */
function timestampDate(timestamp) {
	let date = new Date(timestamp * 1000);
	return {
		month: date.toLocaleString('en-US', { month: 'long' }).substring(0, 3),
		day: date.getDate()
	};
}

/* Copy wallet address */
let copyInputActive = false;
function copyInput(dom) {
  dom.select();

  navigator.clipboard.writeText(dom.value);

  document.getElementById('copiedMessage').style.opacity = "1";
  if(copyInputActive == false) {
    copyInputActive = true;
    setTimeout(() => {
      document.getElementById('copiedMessage').style.opacity = "0";
      copyInputActive = false;
    }, 3000);
  }
}