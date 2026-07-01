var PageMarkToolbar = PageMarkToolbar || {};

(function() {
  PageMarkToolbar.elm = null;
  PageMarkToolbar.collapsed = false;
  PageMarkToolbar._dragOffX = 0;
  PageMarkToolbar._dragOffY = 0;

  PageMarkToolbar.create = function() {
    if (PageMarkToolbar.elm) return;

    var tb = document.createElement('div');
    tb.id = 'pagemark-toolbar';
    tb.setAttribute('data-pagemark', 'true');

    var modeEl = document.createElement('button');
    modeEl.className = 'pm-tb-btn';
    modeEl.title = 'Select one element · Click to pick, double-click for parent, Shift+click for multiple';
    modeEl.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 3l14 9-6 2-3 7-5-18z"/><path d="M11 13l7 7"/></svg>';
    modeEl.setAttribute('data-mode', 'element');
    modeEl.onclick = function() { PageMark.setMode('element'); };
    tb.appendChild(modeEl);

    var modeMulti = document.createElement('button');
    modeMulti.className = 'pm-tb-btn';
    modeMulti.title = 'Multi-Select · Click multiple elements, then click the check to annotate';
    modeMulti.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="3"/><path d="M8 12l3 3 5-5"/></svg>';
    modeMulti.setAttribute('data-mode', 'multi');
    modeMulti.onclick = function() { PageMark.setMode('multi'); };
    tb.appendChild(modeMulti);

    var commitSep = document.createElement('div');
    commitSep.className = 'pm-tb-separator';
    commitSep.id = 'pm-tb-commit-sep';
    commitSep.style.display = 'none';
    tb.appendChild(commitSep);

    var commitBtn = document.createElement('button');
    commitBtn.className = 'pm-tb-btn pm-tb-commit';
    commitBtn.id = 'pm-tb-commit-btn';
    commitBtn.title = 'Commit selection and annotate';
    commitBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 12 10 16 18 8"/></svg>';
    commitBtn.style.display = 'none';
    commitBtn.onclick = function() {
      if (PageMark._multiAnn && PageMark._multiAnn.selectors.length > 0) {
        PageMark._showPopup(null, PageMark._multiAnn);
      }
    };
    tb.appendChild(commitBtn);

    var modeText = document.createElement('button');
    modeText.className = 'pm-tb-btn';
    modeText.title = 'Text · Click a word to select, Ctrl+A to select all similar words';
    modeText.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20L9 4h2l5 16M8 14h8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    modeText.setAttribute('data-mode', 'text');
    modeText.onclick = function() { PageMark.setMode('text'); };
    tb.appendChild(modeText);

    var modeRect = document.createElement('button');
    modeRect.className = 'pm-tb-btn';
    modeRect.title = 'Select area · Drag a selection box to pick everything inside it';
    modeRect.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="5 3"/><circle cx="3" cy="3" r="2" fill="currentColor"/><circle cx="21" cy="3" r="2" fill="currentColor"/><circle cx="21" cy="21" r="2" fill="currentColor"/><circle cx="3" cy="21" r="2" fill="currentColor"/></svg>';
    modeRect.setAttribute('data-mode', 'rectangle');
    modeRect.onclick = function() { PageMark.setMode('rectangle'); };
    tb.appendChild(modeRect);

    var sep1 = document.createElement('div');
    sep1.className = 'pm-tb-separator';
    tb.appendChild(sep1);

    var clearBtn = document.createElement('button');
    clearBtn.className = 'pm-tb-btn pm-tb-clear';
    clearBtn.title = 'Clear All · Remove all annotations';
    clearBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
    clearBtn.onclick = function() {
      PageMark.annotations = [];
      var c = document.getElementById('pagemark-container');
      if (c) c.querySelectorAll('.pagemark-annotated-label').forEach(function(l) { l.remove(); });
      PageMark.highlightElms.forEach(function(hl) { hl.remove(); });
      PageMark.highlightElms.clear();
      PageMark._removeAllTextHighlights();
      PageMarkToolbar.updateBadge(0);
    };
    tb.appendChild(clearBtn);

    var sep2 = document.createElement('div');
    sep2.className = 'pm-tb-separator';
    tb.appendChild(sep2);

    var genBtn = document.createElement('button');
    genBtn.className = 'pm-tb-btn generate';
    genBtn.title = 'Generate Prompt · Compile all annotations into a markdown prompt for your AI agent';
    genBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    genBtn.onclick = function() { PageMarkToolbar._showGenerateModal(); };
    tb.appendChild(genBtn);

    var sep3 = document.createElement('div');
    sep3.className = 'pm-tb-separator';
    tb.appendChild(sep3);

    var badge = document.createElement('div');
    badge.className = 'pm-tb-badge';
    badge.title = '0 annotations — click Generate to compile a prompt';
    var countSpan = document.createElement('div');
    countSpan.className = 'pm-tb-badge-count';
    countSpan.textContent = '0';
    badge.appendChild(countSpan);

    var sevBar = document.createElement('div');
    sevBar.className = 'pm-tb-severity-bar';
    sevBar.id = 'pm-tb-sev-bar';
    badge.appendChild(sevBar);

    tb.appendChild(badge);

    document.body.appendChild(tb);
    PageMarkToolbar.elm = tb;
    PageMarkToolbar._makeDraggable(tb);

    PageMarkToolbar._resizeHandler = function() {
      if (PageMarkToolbar.elm) {
        var rect = PageMarkToolbar.elm.getBoundingClientRect();
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        // Clamp to viewport
        var newLeft = parseInt(PageMarkToolbar.elm.style.left) || (vw - rect.width - 16);
        var newTop = parseInt(PageMarkToolbar.elm.style.top) || Math.round(vh / 2 - rect.height / 2);
        newLeft = Math.max(4, Math.min(newLeft, vw - rect.width - 4));
        newTop = Math.max(4, Math.min(newTop, vh - rect.height - 4));
        if (PageMarkToolbar.elm.style.left) PageMarkToolbar.elm.style.left = newLeft + 'px';
        if (PageMarkToolbar.elm.style.top) PageMarkToolbar.elm.style.top = newTop + 'px';
        if (!PageMarkToolbar.elm.style.left || PageMarkToolbar.elm.style.left === 'auto') {
          PageMarkToolbar.elm.style.right = '16px';
          PageMarkToolbar.elm.style.top = '50%';
          PageMarkToolbar.elm.style.transform = 'translateY(-50%)';
        }
      }
    };
    window.addEventListener('resize', PageMarkToolbar._resizeHandler);

    PageMarkToolbar.setActiveMode(PageMark.mode);
    PageMarkToolbar.updateBadge(PageMark.annotations.length);
  };

  PageMarkToolbar.destroy = function() {
    if (PageMarkToolbar._resizeHandler) {
      window.removeEventListener('resize', PageMarkToolbar._resizeHandler);
    }
    if (PageMarkToolbar.elm) {
      PageMarkToolbar.elm.remove();
      PageMarkToolbar.elm = null;
    }
  };

  PageMarkToolbar.updateBadge = function(count) {
    var tb = PageMarkToolbar.elm;
    if (!tb) return;
    var c = tb.querySelector('.pm-tb-badge-count');
    if (c) c.textContent = String(count);

    var sevBar = tb.querySelector('.pm-tb-severity-bar');
    if (!sevBar) return;
    sevBar.innerHTML = '';

    var must = 0, should = 0, nit = 0;
    for (var i = 0; i < PageMark.annotations.length; i++) {
      var a = PageMark.annotations[i];
      if (a.severity === 'must') must++;
      else if (a.severity === 'should') should++;
      else nit++;
    }

    var total = must + should + nit;
    if (total === 0) {
      sevBar.style.display = 'none';
      return;
    }
    sevBar.style.display = 'flex';

    var widths = [];
    if (must > 0) widths.push({ cls: 'must', pct: (must / total) * 100 });
    if (should > 0) widths.push({ cls: 'should', pct: (should / total) * 100 });
    if (nit > 0) widths.push({ cls: 'nit', pct: (nit / total) * 100 });

    for (var j = 0; j < widths.length; j++) {
      var seg = document.createElement('div');
      seg.className = 'pm-seg ' + widths[j].cls;
      seg.style.width = widths[j].pct + '%';
      sevBar.appendChild(seg);
    }

    var tooltip = [];
    if (must > 0) tooltip.push(must + ' must');
    if (should > 0) tooltip.push(should + ' should');
    if (nit > 0) tooltip.push(nit + ' nit');
    tb.querySelector('.pm-tb-badge').title = tooltip.join(', ');

    var genBtn = tb.querySelector('.pm-tb-btn.generate');
    if (genBtn) genBtn.style.display = total > 0 ? 'flex' : 'none';
  };

  PageMarkToolbar.setActiveMode = function(mode) {
    var tb = PageMarkToolbar.elm;
    if (!tb) return;

    tb.className = 'pm-mode-' + mode;

    var btns = tb.querySelectorAll('.pm-tb-btn[data-mode]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === mode);
    }
  };

  PageMarkToolbar.updateMultiSelectState = function() {
    var tb = PageMarkToolbar.elm;
    if (!tb) return;
    var commitBtn = tb.querySelector('#pm-tb-commit-btn');
    var commitSep = tb.querySelector('#pm-tb-commit-sep');
    if (!commitBtn || !commitSep) return;
    var visible = PageMark.mode === 'multi' && PageMark._multiAnn && PageMark._multiAnn.selectors && PageMark._multiAnn.selectors.length > 0;
    commitBtn.style.display = visible ? 'flex' : 'none';
    commitSep.style.display = visible ? 'block' : 'none';
  };

  PageMarkToolbar._makeDraggable = function(elm) {
    var startX, startY, origX, origY;
    var dragging = false;

    elm.addEventListener('mousedown', function(e) {
      if (e.target.closest('.pm-tb-btn')) return;
      dragging = true;
      var rect = elm.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      origX = rect.left;
      origY = rect.top;
      elm.style.cursor = 'grabbing';
      elm.style.position = 'fixed';
      elm.style.right = 'auto';
      elm.style.top = origY + 'px';
      elm.style.left = origX + 'px';
      elm.style.transform = 'none';
    });

    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      elm.style.left = (origX + dx) + 'px';
      elm.style.top = (origY + dy) + 'px';
    });

    document.addEventListener('mouseup', function() {
      if (!dragging) return;
      dragging = false;
      elm.style.cursor = 'grab';
    });
  };

  PageMarkToolbar._showGenerateModal = function() {
    var existing = document.getElementById('pagemark-generate-modal');
    if (existing) { existing.remove(); return; }

    var annCount = PageMark.annotations.filter(function(a) { return a.status === 'open'; }).length;
    if (annCount === 0) {
      PageMark._showToast('No annotations to generate from');
      return;
    }

    var promptText = PromptGenerator.generate(PageMark.annotations, {
      pageTitle: document.title,
      pageUrl: location.href,
      projectRoot: FileDetector.getLastDetectedRoot() || ''
    });

    var overlay = document.createElement('div');
    overlay.id = 'pagemark-generate-modal';

    overlay.innerHTML =
      '<div class="pm-gen-box">' +
        '<div class="pm-gen-header">' +
          '<span>Generate Prompt</span>' +
          '<button class="pm-gen-close" id="pm-gen-close">&times;</button>' +
        '</div>' +
        '<div class="pm-gen-body">' +
          '<textarea id="pm-gen-text" spellcheck="false">' + _escapeHtml(promptText) + '</textarea>' +
        '</div>' +
        '<div class="pm-gen-footer">' +
          '<button class="pm-gen-copy" id="pm-gen-copy">Copy</button>' +
          '<button class="pm-gen-download" id="pm-gen-download">Download</button>' +
          '<button class="pm-gen-close-btn" id="pm-gen-close2">Close</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('pm-gen-close').onclick = function() { overlay.remove(); };
    document.getElementById('pm-gen-close2').onclick = function() { overlay.remove(); };
    document.getElementById('pm-gen-copy').onclick = function() {
      var ta = document.getElementById('pm-gen-text');
      ta.select();
      document.execCommand('copy');
      PageMark._showToast('Copied to clipboard');
    };
    document.getElementById('pm-gen-download').onclick = function() {
      var ta = document.getElementById('pm-gen-text');
      var blob = new Blob([ta.value], { type: 'text/markdown' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'pagemark-prompt.md';
      a.click();
      URL.revokeObjectURL(url);
    };
  };

  function _escapeHtml(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }
})();
