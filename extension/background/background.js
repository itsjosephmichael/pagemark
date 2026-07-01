const activeTabs = new Map();
const popupPorts = new Map();

function annotationKey(tabId) {
  return `pagemark_annotations_${tabId}`;
}

function tabStateKey(tabId) {
  return `pagemark_active_${tabId}`;
}

async function getAnnotations(tabId) {
  const key = annotationKey(tabId);
  const result = await chrome.storage.session.get(key);
  return result[key] || [];
}

async function setAnnotations(tabId, annotations) {
  const key = annotationKey(tabId);
  await chrome.storage.session.set({ [key]: annotations });
}

// Keep state, persist in session so SW restart doesn't lose it
async function setTabActive(tabId, active) {
  if (active) {
    activeTabs.set(tabId, true);
    await chrome.storage.session.set({ [tabStateKey(tabId)]: true });
  } else {
    activeTabs.delete(tabId);
    await chrome.storage.session.remove(tabStateKey(tabId));
  }
}

async function restoreActiveTabs() {
  const all = await chrome.storage.session.get(null);
  for (const key of Object.keys(all)) {
    if (key.startsWith('pagemark_active_')) {
      const tabId = parseInt(key.replace('pagemark_active_', ''), 10);
      if (all[key]) activeTabs.set(tabId, true);
    }
  }
}

async function sendToTab(tabId, msg) {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch {}
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onStartup.addListener(restoreActiveTabs);

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url && tab.url.startsWith('http')) {
    if (activeTabs.has(tabId)) {
      sendToTab(tabId, { type: 'PAGEMARK_ACTIVATE' });
    }
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'complete' && activeTabs.has(tabId)) {
    sendToTab(tabId, { type: 'PAGEMARK_ACTIVATE' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = message.tabId ?? sender.tab?.id;

  switch (message.type) {
    case 'PAGEMARK_CONTENT_READY': {
      // Content script handshake — re-send current activation state
      const active = activeTabs.has(tabId);
      sendResponse({ active });
      return true;
    }

    case 'OPTIONS_CHANGED': {
      chrome.storage.local.get('projectRoot', (r) => {
        const root = r.projectRoot || '';
        for (const tid of activeTabs.keys()) {
          sendToTab(tid, { type: 'PAGEMARK_PROJECT_ROOT', projectRoot: root });
        }
      });
      sendResponse({ ok: true });
      break;
    }

    case 'GET_STATUS': {
      const active = tabId ? activeTabs.has(tabId) : false;
      sendResponse({ active });
      return true;
    }

    case 'ACTIVATE': {
      setTabActive(message.tabId, true);
      sendToTab(message.tabId, { type: 'PAGEMARK_ACTIVATE' });
      sendResponse({ ok: true });
      break;
    }

    case 'DEACTIVATE': {
      setTabActive(message.tabId, false);
      sendToTab(message.tabId, { type: 'PAGEMARK_DEACTIVATE' });
      sendResponse({ ok: true });
      break;
    }

    case 'GET_ANNOTATIONS': {
      getAnnotations(tabId).then((anns) => sendResponse({ annotations: anns }));
      return true;
    }

    case 'ANNOTATION_SAVED': {
      getAnnotations(tabId).then(async (anns) => {
        anns.push(message.annotation);
        await setAnnotations(tabId, anns);
        for (const p of popupPorts.values()) {
          try { p.postMessage({ type: 'ANNOTATIONS_UPDATED', annotations: anns }); } catch {}
        }
        sendResponse({ ok: true });
      });
      return true;
    }

    case 'ANNOTATION_DELETED': {
      getAnnotations(tabId).then(async (anns) => {
        const filtered = anns.filter((a) => a.id !== message.id);
        await setAnnotations(tabId, filtered);
        for (const p of popupPorts.values()) {
          try { p.postMessage({ type: 'ANNOTATIONS_UPDATED', annotations: filtered }); } catch {}
        }
        sendResponse({ ok: true });
      });
      return true;
    }

    case 'ANNOTATION_DELETED_ALL': {
      getAnnotations(tabId).then(async (anns) => {
        const filtered = message.ids ? anns.filter((a) => message.ids.indexOf(a.id) === -1) : [];
        await setAnnotations(tabId, filtered);
        for (const p of popupPorts.values()) {
          try { p.postMessage({ type: 'ANNOTATIONS_UPDATED', annotations: filtered }); } catch {}
        }
        sendResponse({ ok: true });
      });
      return true;
    }

    case 'ANNOTATION_UPDATED': {
      getAnnotations(tabId).then(async (anns) => {
        const idx = anns.findIndex((a) => a.id === message.id);
        if (idx !== -1) {
          for (const k in message.updates) anns[idx][k] = message.updates[k];
        }
        await setAnnotations(tabId, anns);
        for (const p of popupPorts.values()) {
          try { p.postMessage({ type: 'ANNOTATIONS_UPDATED', annotations: anns }); } catch {}
        }
        sendResponse({ ok: true });
      });
      return true;
    }

    default:
      break;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'pagemark-popup') {
    const portId = Symbol();
    popupPorts.set(portId, port);
    port.onDisconnect.addListener(() => popupPorts.delete(portId));

    port.onMessage.addListener(async (msg) => {
      switch (msg.type) {
        case 'GET_STATUS': {
          const active = activeTabs.has(msg.tabId);
          port.postMessage({ type: 'STATUS', active });
          break;
        }
        case 'ACTIVATE': {
          setTabActive(msg.tabId, true);
          sendToTab(msg.tabId, { type: 'PAGEMARK_ACTIVATE' });
          port.postMessage({ type: 'ACTIVATED' });
          break;
        }
        case 'DEACTIVATE': {
          setTabActive(msg.tabId, false);
          sendToTab(msg.tabId, { type: 'PAGEMARK_DEACTIVATE' });
          port.postMessage({ type: 'DEACTIVATED' });
          break;
        }
        case 'GET_ANNOTATIONS': {
          const anns = await getAnnotations(msg.tabId);
          port.postMessage({ type: 'ANNOTATIONS', annotations: anns });
          break;
        }
        case 'SET_MODE': {
          sendToTab(msg.tabId, { type: 'PAGEMARK_SET_MODE', mode: msg.mode });
          break;
        }
      }
    });
  }
});
