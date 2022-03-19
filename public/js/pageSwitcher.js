let currentPage = 'dashboard';
function switchPage(dom) {
  /* Dom elements */
  const dashboardPage = document.getElementById('dashboardPage');
  const sendPage = document.getElementById('sendPage');
  const receivePage = document.getElementById('receivePage');
  const tokensPage = document.getElementById('tokensPage');
  const settingsPage = document.getElementById('settingsPage');

  /* Hide all pages */
  function hideAll() {
    dashboardPage.classList.add('d-none');
    sendPage.classList.add('d-none');
    receivePage.classList.add('d-none');
    tokensPage.classList.add('d-none');
    settingsPage.classList.add('d-none');
  }

  if(dom.id == 'aDashboard' && dom.classList.value !== 'hover') {
    hideAll();
    dashboardPage.classList.remove('d-none');
  } else if(dom.id == 'aSend' && dom.classList.value !== 'hover') {
    hideAll();
    sendPage.classList.remove('d-none');
  } else if(dom.id == 'aReceive' && dom.classList.value !== 'hover') {
    hideAll();
    receivePage.classList.remove('d-none');
  } else if(dom.id == 'aTokens' && dom.classList.value !== 'hover') {
    hideAll();
    tokensPage.classList.remove('d-none');
  } else if(dom.id == 'aSettings' && dom.classList.value !== 'hover') {
    hideAll();
    settingsPage.classList.remove('d-none');
  }

  document.getElementById('aDashboard').classList = '';
  document.getElementById('aSend').classList = '';
  document.getElementById('aReceive').classList = '';
  document.getElementById('aTokens').classList = '';
  document.getElementById('aSettings').classList = '';

  dom.classList = 'hover';
}

switchPage(document.getElementById('aTokens'));