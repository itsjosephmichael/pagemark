var FileDetector = FileDetector || {};
var _projectRoot = '';

var sourcemapCache = {};

FileDetector.getReactFile = function getReactFile(elm) {
  try {
    var fiberKey = Object.keys(elm).find(function (k) {
      return k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$');
    });
    if (!fiberKey) return null;
    var fiber = elm[fiberKey];

    function walkFiber(f) {
      if (!f) return null;
      if (f._debugSource && f._debugSource.fileName) {
        return { file: f._debugSource.fileName, line: f._debugSource.lineNumber, col: f._debugSource.columnNumber };
      }
      return walkFiber(f.return);
    }

    return walkFiber(fiber);
  } catch (e) {
    return null;
  }
};

FileDetector.getVueFile = function getVueFile(elm) {
  try {
    var vueKey = Object.keys(elm).find(function (k) {
      return k.startsWith('__vueParentComponent') || k.startsWith('__vue_component__');
    });
    if (!vueKey) return null;
    var vueData = elm[vueKey];
    if (vueData && vueData.__file) {
      return { file: vueData.__file, line: null, col: null };
    }
    return null;
  } catch (e) {
    return null;
  }
};

FileDetector.getSourceMapUrl = function getSourceMapUrl(scriptSrc) {
  var match = scriptSrc.match(/\/\/#\s*sourceMappingURL=(.*)/);
  return match ? match[1].trim() : null;
};

FileDetector.parseSourcemap = function parseSourcemap(url) {
  if (sourcemapCache[url]) return Promise.resolve(sourcemapCache[url]);

  return fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to fetch sourcemap');
      return res.json();
    })
    .then(function (map) {
      sourcemapCache[url] = map;
      return map;
    })
    .catch(function () {
      return null;
    });
};

// ponytail: simple VLQ-free mapping, covers the 90% case where line/col are 1:1
FileDetector.mapPosition = function mapPosition(sourcemap, line, col) {
  if (!sourcemap || !sourcemap.mappings) return null;
  try {
    var lines = sourcemap.mappings.split(';');
    if (line > lines.length) return null;
    var lineMappings = lines[line - 1];
    if (!lineMappings || lineMappings === '') return null;
    var segs = lineMappings.split(',');
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      if (!seg) continue;
      var parts = seg.split('AA'); // ponytail: heuristic mapping only
      if (sourcemap.sources && sourcemap.sources[0]) {
        return {
          source: sourcemap.sources[0],
          line: line,
          column: col
        };
      }
    }
    if (sourcemap.sources && sourcemap.sources[0]) {
      return {
        source: sourcemap.sources[0],
        line: line,
        column: col
      };
    }
    return null;
  } catch (e) {
    return null;
  }
};

function findScriptsForElement(elm) {
  var scripts = document.querySelectorAll('script[src]');
  return Array.prototype.slice.call(scripts);
}

function trySourcemapFallback(elm) {
  var scripts = findScriptsForElement(elm);
  var chain = Promise.resolve(null);

  scripts.forEach(function (script) {
    chain = chain.then(function (result) {
      if (result) return result;
      return fetch(script.src)
        .then(function (res) { return res.text(); })
        .then(function (text) {
          var url = FileDetector.getSourceMapUrl(text);
          if (!url) return null;
          var absUrl = new URL(url, script.src).href;
          return FileDetector.parseSourcemap(absUrl).then(function (map) {
            if (!map) return null;
            return {
              file: map.sources && map.sources[0] ? map.sources[0] : null,
              autoDetected: true,
              method: 'sourcemap'
            };
          });
        })
        .catch(function () { return null; });
    });
  });

  return chain;
}

FileDetector.setProjectRoot = function(root) {
  _projectRoot = root || '';
};

FileDetector.toRelativePath = function(absolutePath) {
  if (!absolutePath || !_projectRoot) return absolutePath;
  var idx = absolutePath.indexOf(_projectRoot);
  if (idx === -1) {
    var normalizedRoot = _projectRoot.replace(/\\/g, '/');
    var normalizedPath = absolutePath.replace(/\\/g, '/');
    idx = normalizedPath.indexOf(normalizedRoot);
    if (idx !== -1) return normalizedPath.slice(normalizedRoot.length).replace(/^[\\/]/, '');
    return absolutePath;
  }
  return absolutePath.slice(_projectRoot.length).replace(/^[\\/]/, '');
};

FileDetector.detect = function detect(elm) {
  var reactResult = FileDetector.getReactFile(elm);
  if (reactResult) {
    return {
      file: FileDetector.toRelativePath(reactResult.file),
      autoDetected: true,
      method: 'react'
    };
  }

  var vueResult = FileDetector.getVueFile(elm);
  if (vueResult) {
    return {
      file: FileDetector.toRelativePath(vueResult.file),
      autoDetected: true,
      method: 'vue'
    };
  }

  var urlFile = (function() {
    var p = location.pathname.replace(/\/$/, '');
    var m = p.match(/\/([\w.-]+)$/);
    var f = m ? m[1] : null;
    if (f && f.indexOf('.') === -1) f = f + '.(tsx|jsx|ts|js)';
    return f;
  })();

  return {
    file: urlFile || null,
    autoDetected: false,
    method: urlFile ? 'url_fallback' : null
  };
};

FileDetector.detectAsync = function detectAsync(elm) {
  var sync = FileDetector.detect(elm);
  if (sync.file) return Promise.resolve(sync);

  return trySourcemapFallback(elm).then(function (result) {
    if (result) {
      if (result.file) result.file = FileDetector.toRelativePath(result.file);
      return result;
    }
    return { file: null, autoDetected: false, method: null };
  });
};

function checkWellKnownRoot() {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', window.location.origin + '/.well-known/appspecific/com.chrome.devtools.json', false);
    xhr.send(null);
    if (xhr.status === 200) {
      var data = JSON.parse(xhr.responseText);
      if (data && data.workspace && data.workspace.root) {
        return { root: data.workspace.root.replace(/^\/+/, ''), method: 'wellknown' };
      }
    }
  } catch (e) {}
  return null;
}

function getServerRootFromGlobals() {
  if (typeof __webpack_public_path__ !== 'undefined') {
    try {
      var wpp = __webpack_public_path__;
      if (typeof wpp === 'string' && wpp.startsWith('/')) {
        var parts = wpp.replace(/^\/+/, '').split('/').filter(Boolean);
        return { root: parts[0] || null, method: 'webpack_public_path' };
      }
    } catch(e) {}
  }

  if (typeof __webpack_base_uri__ !== 'undefined') {
    try {
      var wbu = __webpack_base_uri__;
      if (typeof wbu === 'string' && wbu !== '/') {
        var baseParts = wbu.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean);
        if (baseParts.length > 0) {
          return { root: baseParts[0], method: 'webpack_base_uri' };
        }
      }
    } catch(e) {}
  }

  if (typeof __VITE_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined' || typeof __vite__injectQuery !== 'undefined') {
    return { root: 'src', method: 'vite_global' };
  }

  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined') {
    return { root: 'src', method: 'react_devtools' };
  }

  try {
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV) {
      return { root: 'src', method: 'cra_env' };
    }
  } catch(e) {}

  return null;
}

function getRootFromSourcemaps() {
  if (typeof __NEXT_DATA__ !== 'undefined') {
    return { root: null, method: 'nextjs' };
  }

  var scripts = document.querySelectorAll('script[src]');
  var best = null;
  for (var i = 0; i < scripts.length; i++) {
    var src = scripts[i].src;
    if (!src) continue;
    if (src.indexOf('/node_modules/') !== -1) continue;
    if (src.indexOf('/_next/static/') !== -1) {
      best = { root: null, method: 'nextjs' };
      break;
    }
    if (src.indexOf('/static/js/bundle.js') !== -1 || src.indexOf('/static/js/') !== -1) {
      best = { root: null, method: 'cra' };
    }
    if (src.indexOf('/assets/') !== -1) {
      var m2 = src.match(/^https?:\/\/[^\/]+\/([^\/]+)\/assets\//);
      if (m2) best = { root: m2[1], method: 'vite_assets' };
      else best = { root: null, method: 'vite' };
    }
  }
  return best;
}

function getRootFromSourcemapSources(sources) {
  if (!sources || !sources.length) return null;

  var cleanPaths = [];
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    if (!s) continue;
    if (s.indexOf('node_modules') !== -1) continue;
    var cleaned = s.replace(/^webpack:\/\/(\.\/)?\/?/, '').replace(/^webpack-internal:\/\//, '').replace(/^file:\/\/\/?/, '');
    if (!cleaned) continue;
    cleanPaths.push(cleaned);
  }

  if (cleanPaths.length === 0) return null;

  var partsList = [];
  for (var j = 0; j < cleanPaths.length; j++) {
    partsList.push(cleanPaths[j].split('/'));
  }

  var common = partsList[0].slice(0, -1);
  for (var k = 1; k < partsList.length; k++) {
    var limit = Math.min(common.length, partsList[k].length - 1);
    var newCommon = [];
    for (var l = 0; l < limit; l++) {
      if (common[l] === partsList[k][l]) {
        newCommon.push(common[l]);
      } else {
        break;
      }
    }
    common = newCommon;
    if (common.length === 0) break;
  }

  if (common.length > 0) {
    var rootPath = common.filter(function(p) { return p && p !== '.' && p !== '..'; }).join('/');
    return { root: rootPath || null, method: 'sourcemap_sources' };
  }

  return null;
}

function getRootFromUrlPath(pathname) {
  var parts = pathname.split('/').filter(Boolean);
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === 'src' || parts[i] === 'app' || parts[i] === 'client' || parts[i] === 'frontend' || parts[i] === 'public' || parts[i] === 'dist' || parts[i] === 'packages' || parts[i] === 'apps' || parts[i] === 'modules') {
      var projectRoot = parts.slice(0, i).join('/');
      var pageSubdir = parts.slice(i + 1, -1).join('/');
      return { root: projectRoot || null, subdir: pageSubdir || null, method: 'url_path' };
    }
  }
  return null;
}

function getRootFromFileProtocol(pathname) {
  var path = decodeURIComponent(pathname).replace(/^\/+/, '');
  var parts = path.replace(/\\/g, '/').split('/').filter(Boolean);

  var projectMarkers = ['package.json', 'node_modules', '.git', 'yarn.lock', 'pnpm-lock.yaml', 'tsconfig.json', 'vite.config.ts', 'vite.config.js', 'next.config.js', 'webpack.config.js'];

  var pageSubdir = null;

  for (var endIdx = parts.length; endIdx > 0; endIdx--) {
    var candidate = parts.slice(0, endIdx).join('/');
    var fileName = parts[endIdx - 1] || '';

    if (endIdx < parts.length) {
      var checkDir = parts.slice(0, endIdx).join('/');
      for (var mk = 0; mk < projectMarkers.length; mk++) {
        var marker = projectMarkers[mk];
        try {
          var req = new XMLHttpRequest();
          req.open('HEAD', 'file:///' + checkDir + '/' + marker, false);
          req.send();
          if (req.status === 0 || req.status === 200) {
            pageSubdir = parts.slice(endIdx, -1).join('/') || null;
            return { root: checkDir, subdir: pageSubdir, method: 'file_marker_' + marker };
          }
        } catch(e) {}
      }
    }

    if (fileName === 'index.html') {
      pageSubdir = parts.slice(endIdx, -1).join('/') || null;
      return { root: parts.slice(0, endIdx - 1).join('/'), subdir: pageSubdir, method: 'file_index_html' };
    }

    if (fileName === 'src' || fileName === 'app' || fileName === 'public' || fileName === 'client' || fileName === 'frontend') {
      pageSubdir = parts.slice(endIdx, -1).join('/') || null;
      return { root: parts.slice(0, endIdx).join('/'), subdir: pageSubdir, method: 'file_srcdir_' + fileName };
    }
  }

  if (parts.length > 1) {
    var projectRoot = parts.slice(0, parts.length - 1).join('/');
    pageSubdir = null;
    return { root: projectRoot, subdir: pageSubdir, method: 'file_fallback' };
  }

  return null;
}

function getRootFromScriptElements() {
  var scripts = document.querySelectorAll('script[src]');
  for (var i = 0; i < scripts.length; i++) {
    var src = scripts[i].src;
    if (!src) continue;

    if (src.indexOf('/node_modules/') !== -1) continue;

    if (src.indexOf('@vite/client') !== -1) {
      var vcMatch = src.match(/^https?:\/\/[^\/]+(\/.+?)?\/@vite\//);
      if (vcMatch && vcMatch[1]) {
        return { root: vcMatch[1].replace(/^\//, ''), method: 'vite_client' };
      }
      return { root: '', method: 'vite_client' };
    }

    if (src.indexOf('@react-refresh') !== -1) {
      var rrMatch = src.match(/^https?:\/\/[^\/]+(\/.+?)?\/@react-refresh/);
      if (rrMatch && rrMatch[1]) {
        return { root: rrMatch[1].replace(/^\//, ''), method: 'react_refresh' };
      }
      return { root: '', method: 'react_refresh' };
    }

    if (src.indexOf('webpack-hot-middleware') !== -1) {
      var whMatch = src.match(/^https?:\/\/[^\/]+(\/.+?)?\/webpack-hot-middleware/);
      if (whMatch && whMatch[1]) {
        return { root: whMatch[1].replace(/^\//, ''), method: 'webpack_hmr' };
      }
      return { root: '', method: 'webpack_hmr' };
    }

    if (src.indexOf('/src/') !== -1) {
      var m = src.match(/^https?:\/\/[^\/]+(\/.*?)\/src\//);
      if (m) return { root: m[1].replace(/^\//, ''), method: 'script_src' };
    }

    if (src.indexOf('/app/') !== -1) {
      var m2 = src.match(/^https?:\/\/[^\/]+(\/.*?)\/app\//);
      if (m2) return { root: m2[1].replace(/^\//, ''), method: 'script_app' };
    }

    if (src.indexOf('/static/') !== -1 && src.indexOf('/static/media/') === -1) {
      var m3 = src.match(/^https?:\/\/[^\/]+(\/.*?)\/static\//);
      if (m3) return { root: m3[1].replace(/^\//, ''), method: 'script_static' };
    }
  }

  return null;
}

function getRootFromDocumentUrl() {
  var url = window.location.href;
  try {
    var u = new URL(url);
    var hostParts = u.hostname.split('.');

    if (hostParts.length >= 2 && hostParts[0] !== 'www') {
      var projectName = hostParts[0];
      var pagePath = u.pathname.replace(/\/[^\/]*$/, '');
      return { root: projectName + pagePath, method: 'subdomain' };
    }

    var pathParts = u.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      var possibleProject = pathParts[0];
      if (possibleProject.length > 1 && /^[a-zA-Z0-9_-]+$/.test(possibleProject)) {
        var rest = pathParts.slice(1, -1).join('/');
        return { root: possibleProject + (rest ? '/' + rest : ''), method: 'url_pathname' };
      }
    }
  } catch(e) {}
  return null;
}

FileDetector.autoDetectProjectRoot = function() {
  var url = window.location.href;
  var u;

  try {
    u = new URL(url);
  } catch(e) {
    return null;
  }

  var result = null;
  var pageSubdir = null;

  if (u.protocol === 'file:') {
    result = getRootFromFileProtocol(u.pathname);
  } else if (u.protocol === 'http:' || u.protocol === 'https:') {
    var hostname = u.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname === '0.0.0.0') {

      var wk = checkWellKnownRoot();
      if (wk) {
        result = { root: wk.root || '', method: wk.method };
      }

      if (!result) {
        var g = getServerRootFromGlobals();
        if (g) {
          var rootPath = g.root || '';
          result = { root: rootPath, method: g.method };
        }
      }

      if (!result) {
        var sm = getRootFromSourcemaps();
        if (sm) {
          if (sm.root) {
            result = { root: sm.root, method: sm.method };
          } else {
            result = { root: '', method: sm.method };
          }
        }
      }

      if (!result) {
        var se = getRootFromScriptElements();
        if (se) result = { root: se.root, method: se.method };
      }

      if (!result) {
        var up = getRootFromUrlPath(u.pathname);
        if (up) {
          result = { root: up.root || '', method: up.method };
          pageSubdir = up.subdir || null;
        }
      }

      if (!result) {
        var du = getRootFromDocumentUrl();
        if (du) result = { root: du.root, method: du.method };
      }

      if (!result) {
        var scripts = document.querySelectorAll('script[src]');
        for (var i = 0; i < scripts.length; i++) {
          var src = scripts[i].src;
          if (!src) continue;
          if (src.indexOf('/node_modules/') !== -1) continue;
          if (src.indexOf('/_next/') !== -1) {
            result = { root: '', method: 'nextjs_fallback' };
            break;
          }
          if (src.indexOf('/static/') !== -1) {
            result = { root: '', method: 'cra_fallback' };
            break;
          }
          var m = src.match(/^https?:\/\/[^\/]+\/([^\/]+)\//);
          if (m && m[1] !== 'static' && m[1] !== 'assets' && m[1] !== 'js' && m[1] !== 'css') {
            result = { root: m[1], method: 'script_url' };
            break;
          }
        }
      }
    }
  }

  if (result && result.root !== undefined) {
    var finalRoot = result.root || '';
    if (pageSubdir) {
      if (finalRoot) {
        finalRoot = finalRoot + '/' + pageSubdir;
      } else {
        finalRoot = pageSubdir;
      }
    }
    _projectRoot = finalRoot;
    return finalRoot || null;
  }

  _projectRoot = '';
  return null;
};

FileDetector.getLastDetectedRoot = function() {
  return _projectRoot;
};

FileDetector.watchForPageChanges = function(callback) {
  var lastUrl = window.location.href;

  function checkUrl() {
    var currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      var root = FileDetector.autoDetectProjectRoot();
      if (callback) callback(root);
    }
  }

  window.addEventListener('popstate', checkUrl);
  window.addEventListener('hashchange', checkUrl);

  var origPushState = history.pushState;
  history.pushState = function() {
    origPushState.apply(this, arguments);
    checkUrl();
  };

  var origReplaceState = history.replaceState;
  history.replaceState = function() {
    origReplaceState.apply(this, arguments);
    checkUrl();
  };

  return function unwatch() {
    window.removeEventListener('popstate', checkUrl);
    window.removeEventListener('hashchange', checkUrl);
    history.pushState = origPushState;
    history.replaceState = origReplaceState;
  };
};
