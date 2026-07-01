(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    cacheTTL: $('cacheTTL'),
    ignoredClasses: $('ignoredClasses'),
    saveBtn: $('saveBtn'),
    resetBtn: $('resetBtn'),
    toast: $('toast'),
  };

  const DEFAULTS = {
    cacheTTL: 300,
    ignoredClasses: 'flex, mt-, mb-, ml-, mr-, pt-, pb-, pl-, pr-, px-, py-, p-, m-, gap-, grid-, items-, justify-, w-, h-, min-w-, min-h-, max-w-, max-h-, absolute, relative, fixed, sticky, block, inline, hidden, visible, opacity-, z-, shadow-, rounded-, border-',
  };

  async function loadSettings() {
    const data = await chrome.storage.local.get(['cacheTTL', 'ignoredClasses']);
    els.cacheTTL.value = data.cacheTTL ?? DEFAULTS.cacheTTL;
    els.ignoredClasses.value = data.ignoredClasses ?? DEFAULTS.ignoredClasses;
  }

  function showToast(msg, duration = 2000) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(els.toast._timer);
    els.toast._timer = setTimeout(() => els.toast.classList.remove('show'), duration);
  }

  els.saveBtn.addEventListener('click', async () => {
    const cacheTTL = parseInt(els.cacheTTL.value, 10);
    const ignoredClasses = els.ignoredClasses.value.trim();

    if (isNaN(cacheTTL) || cacheTTL < 0) {
      showToast('Cache TTL must be a non-negative number');
      return;
    }

    await chrome.storage.local.set({ cacheTTL, ignoredClasses });

    try {
      await chrome.runtime.sendMessage({ type: 'OPTIONS_CHANGED' });
    } catch {}

    showToast('Saved!');
  });

  els.resetBtn.addEventListener('click', async () => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    els.cacheTTL.value = DEFAULTS.cacheTTL;
    els.ignoredClasses.value = DEFAULTS.ignoredClasses;
    showToast('Reset complete!');
  });

  loadSettings();
})();
