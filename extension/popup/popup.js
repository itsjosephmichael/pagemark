(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    url: $('pagemark-url'),
    statusDot: $('pagemark-status-dot'),
    statusText: $('pagemark-status-text'),
    localhostMsg: $('pagemark-localhost-msg'),
    toggleBtn: $('pagemark-toggle-btn'),
    summary: $('pagemark-summary'),
    summaryCounts: $('pagemark-summary-counts'),
    settingsBtn: $('pagemark-settings-btn'),
    prValue: $('pm-pr-value'),
    prWarn: $('pm-pr-warn'),
    prInputRow: $('pm-pr-input-row'),
    prInput: $('pm-pr-input'),
    prSetBtn: $('pm-pr-set-btn'),
    prSaveBtn: $('pm-pr-save-btn'),
  };

  let currentTabId = null;
  let isActive = false;
  let annotations = [];
  let port = null;
  let projectRoot = '';

  async function init() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) return;

    currentTabId = tab.id;
    els.url.textContent = tab.url || '—';

    if (!tab.url || !isLocalhost(tab.url)) {
      showLocalhostMsg();
      return;
    }

    connectPort();

    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_STATUS', tabId: tab.id });
      if (res && typeof res.active === 'boolean') {
        isActive = res.active;
        updateStatusUI(res.active);
      }
    } catch {
      updateStatusUI(false);
    }

    // Load annotations via port or direct
    fetchAnnotations();
    loadProjectRoot();

    enableUI(true);
  }

  function connectPort() {
    try {
      port = chrome.runtime.connect({ name: 'pagemark-popup' });
      port.onMessage.addListener((msg) => {
        if (msg.type === 'ANNOTATIONS_UPDATED') {
          annotations = msg.annotations || [];
          updateAnnotationSummary();
        }
      });
      port.onDisconnect.addListener(() => { port = null; });
    } catch {}
  }

  async function fetchAnnotations() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_ANNOTATIONS', tabId: currentTabId });
      if (res && res.annotations) {
        annotations = res.annotations;
        updateAnnotationSummary();
      }
    } catch {}
  }

  async function loadProjectRoot() {
    try {
      const data = await chrome.storage.local.get('projectRoot');
      projectRoot = data.projectRoot || '';
    } catch {}
    updateProjectRootUI();
  }

  function updateProjectRootUI() {
    els.prValue.textContent = projectRoot || '—';
    if (projectRoot) {
      els.prValue.className = 'pm-pr-value';
      els.prWarn.classList.add('pagemark-hidden');
      els.prInputRow.classList.add('pagemark-hidden');
    } else {
      els.prWarn.classList.remove('pagemark-hidden');
      els.prValue.className = 'pm-pr-value pagemark-pr-missing';
    }
  }

  function isLocalhost(url) {
    try {
      const u = new URL(url);
      return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.protocol === 'file:';
    } catch {
      return false;
    }
  }

  function showLocalhostMsg() {
    els.localhostMsg.classList.remove('pagemark-hidden');
    els.statusDot.className = 'pagemark-dot pagemark-dot-inactive';
    els.statusText.textContent = 'Not available';
    els.toggleBtn.disabled = true;
    els.toggleBtn.textContent = 'Not available';
  }

  function updateStatusUI(active) {
    isActive = active;
    if (active) {
      els.statusDot.className = 'pagemark-dot pagemark-dot-active';
      els.statusText.textContent = 'Active';
      els.toggleBtn.textContent = 'Deactivate';
      els.toggleBtn.className = 'pagemark-btn pagemark-btn-secondary';
    } else {
      els.statusDot.className = 'pagemark-dot pagemark-dot-inactive';
      els.statusText.textContent = 'Inactive';
      els.toggleBtn.textContent = 'Activate on this page';
      els.toggleBtn.className = 'pagemark-btn pagemark-btn-primary';
    }
  }

  function updateAnnotationSummary() {
    if (!annotations.length) {
      els.summary.classList.add('pagemark-hidden');
      return;
    }
    els.summary.classList.remove('pagemark-hidden');
    const counts = { must: 0, should: 0, nit: 0 };
    annotations.forEach((a) => {
      if (counts[a.severity] !== undefined) counts[a.severity]++;
    });
    els.summaryCounts.innerHTML =
      `<span class="pagemark-severity-badge pagemark-severity-must">Must: ${counts.must}</span>` +
      `<span class="pagemark-severity-badge pagemark-severity-should">Should: ${counts.should}</span>` +
      `<span class="pagemark-severity-badge pagemark-severity-nit">Nit: ${counts.nit}</span>`;
  }

  function enableUI(enabled) {
    els.toggleBtn.disabled = !enabled;
  }

  // --- Event listeners ---

  els.toggleBtn.addEventListener('click', async () => {
    const type = isActive ? 'DEACTIVATE' : 'ACTIVATE';
    try {
      await chrome.runtime.sendMessage({ type, tabId: currentTabId });
      isActive = !isActive;
      updateStatusUI(isActive);
    } catch {
      // ignore
    }
  });

  els.settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Project root
  els.prSetBtn.addEventListener('click', () => {
    els.prWarn.classList.add('pagemark-hidden');
    els.prInputRow.classList.remove('pagemark-hidden');
    els.prInput.focus();
  });

  els.prSaveBtn.addEventListener('click', async () => {
    const val = els.prInput.value.trim();
    if (val) {
      projectRoot = val;
      await chrome.storage.local.set({ projectRoot: val });
      // Notify background to broadcast to content script
      try { await chrome.runtime.sendMessage({ type: 'OPTIONS_CHANGED' }); } catch {}
      updateProjectRootUI();
    }
    els.prInputRow.classList.add('pagemark-hidden');
    els.prInput.value = '';
  });

  els.prInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.prSaveBtn.click();
    if (e.key === 'Escape') els.prInputRow.classList.add('pagemark-hidden');
  });

  init();
})();
