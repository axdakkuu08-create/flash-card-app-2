(function () {
  'use strict';

  function init() {
    var toggle = document.getElementById('settings-toggle');
    var settings = document.getElementById('settings-view');
    var appView = document.getElementById('view');
    var dock = document.querySelector('.dock');
    var title = document.getElementById('title');
    if (!toggle || !settings || !appView || !title) return;

    var previousTitle = title.textContent;

    function hideDashboardBackup() {
      var backupAction = appView.querySelector('[data-action="export"]');
      var backupCard = backupAction && backupAction.closest('.card');
      if (backupCard) backupCard.hidden = true;
    }

    var observer = new MutationObserver(hideDashboardBackup);
    observer.observe(appView, { childList: true, subtree: true });
    hideDashboardBackup();

    toggle.addEventListener('click', function () {
      var opening = settings.hidden;
      settings.hidden = !opening;
      appView.hidden = opening;
      if (dock) dock.hidden = opening;
      toggle.textContent = opening ? 'Back' : 'Settings';
      toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
      title.textContent = opening ? 'Settings' : previousTitle;
      if (opening) settings.focus();
      else appView.focus({ preventScroll: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
