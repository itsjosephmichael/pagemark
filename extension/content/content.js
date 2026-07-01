var PageMark = PageMark || {};

(function() {
  PageMark.active = false;
  PageMark.mode = 'element';
  PageMark.annotations = [];
  PageMark.highlightElms = new Map();
  PageMark._dragStart = null;
  PageMark._dragging = false;
  PageMark._wasDrag = false;
  PageMark._textDragCaptured = false;
  PageMark._hoverElm = null;
  PageMark._lastUrl = location.href;
  PageMark._lastTitle = document.title;
  PageMark._textHighlights = new Map();
  PageMark._lastSelectedWord = null;

  PageMark.init = function() {
    chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
      switch (msg.type) {
        case 'PAGEMARK_ACTIVATE':
          PageMark.activate();
          break;
        case 'PAGEMARK_DEACTIVATE':
          PageMark.deactivate();
          break;
        case 'PAGEMARK_SET_MODE':
          PageMark.setMode(msg.mode);
          break;
        case 'PAGEMARK_PROJECT_ROOT':
          FileDetector.setProjectRoot(msg.projectRoot);
          break;
      }
    });
  };

  PageMark.activate = function() {
    if (PageMark.active) return;
    PageMark.active = true;
    PageMark._createContainer();
    PageMark._addListeners();
    PageMark._startObserver();
    PageMarkToolbar.create();

    // Restore annotated labels from saved annotations
    PageMark.sendMessage({ type: 'GET_ANNOTATIONS' }, function(resp) {
      if (resp && resp.annotations) {
        PageMark.annotations = resp.annotations.filter(function(a) { return a.pageUrl === location.href; });
        PageMarkToolbar.updateBadge(PageMark.annotations.length);
        PageMark._restoreAnnotatedLabels();
      }
    });
  };

  PageMark._restoreAnnotatedLabels = function() {
    PageMark.annotations.forEach(function(ann) {
      ann._labelElms = [];
      if (!ann.selectors) return;
      ann.selectors.forEach(function(sel) {
        try {
          var elm = document.querySelector(sel);
          if (elm && document.contains(elm)) {
            PageMark.addHighlight(elm, true, ann.action);
            var label = PageMark.addAnnotatedLabel(elm, ann);
            ann._labelElms.push(label);
          }
        } catch(e) {}
      });
    });
  };

  PageMark.deactivate = function() {
    if (!PageMark.active) return;
    PageMark.active = false;
    PageMark._removeListeners();
    PageMark._stopObserver();
    // Remove all annotated labels
    var container = document.getElementById('pagemark-container');
    if (container) {
      container.querySelectorAll('.pagemark-annotated-label').forEach(function(l) { l.remove(); });
    }
    PageMark._destroyContainer();
    PageMarkToolbar.destroy();
    PageMark.highlightElms.clear();
    PageMarkPopup.hide();
    PageMark._clearMultiSelect();
    PageMark._clearTextHighlights();
  };

  PageMark.setMode = function(mode) {
    if (['element','rectangle','multi','text'].indexOf(mode) === -1) return;
    PageMark.mode = mode;
    PageMarkToolbar.setActiveMode(mode);
    if (mode !== 'multi') PageMark._clearMultiSelect();
    if (mode !== 'text') PageMark._clearTextHighlights();
    PageMarkToolbar.updateMultiSelectState();
  };

  PageMark._createContainer = function() {
    if (document.getElementById('pagemark-container')) return;
    var el = document.createElement('div');
    el.id = 'pagemark-container';
    document.body.appendChild(el);

    PageMark._hoverPreview = document.createElement('div');
    PageMark._hoverPreview.id = 'pagemark-hover-preview';
    el.appendChild(PageMark._hoverPreview);

    PageMark._rectElm = document.createElement('div');
    PageMark._rectElm.id = 'pagemark-rect';
    PageMark._rectElm.style.display = 'none';
    el.appendChild(PageMark._rectElm);
  };

  PageMark._destroyContainer = function() {
    var el = document.getElementById('pagemark-container');
    if (el) el.remove();
    PageMark._hoverPreview = null;
    PageMark._rectElm = null;
  };

  PageMark._addListeners = function() {
    document.addEventListener('mousemove', PageMark._onMouseMove, false);
    document.addEventListener('mousedown', PageMark._onMouseDown, false);
    document.addEventListener('mouseup', PageMark._onMouseUp, false);
    document.addEventListener('click', PageMark._onClick, true);
    document.addEventListener('dblclick', PageMark._onDblClick, false);
    document.addEventListener('keydown', PageMark._onKeyDown, false);
    document.addEventListener('keyup', PageMark._onKeyUp, false);
    window.addEventListener('scroll', PageMark._onScroll, true);
    window.addEventListener('resize', PageMark._onResize, false);
  };

  PageMark._removeListeners = function() {
    document.removeEventListener('mousemove', PageMark._onMouseMove, false);
    document.removeEventListener('mousedown', PageMark._onMouseDown, false);
    document.removeEventListener('mouseup', PageMark._onMouseUp, false);
    document.removeEventListener('click', PageMark._onClick, true);
    document.removeEventListener('dblclick', PageMark._onDblClick, false);
    document.removeEventListener('keydown', PageMark._onKeyDown, false);
    document.removeEventListener('keyup', PageMark._onKeyUp, false);
    window.removeEventListener('scroll', PageMark._onScroll, true);
    window.removeEventListener('resize', PageMark._onResize, false);
  };

  PageMark._isOurUI = function(elm) {
    while (elm && elm !== document.body) {
      if (elm.id && elm.id.indexOf('pagemark-') === 0) return true;
      elm = elm.parentElement;
    }
    return false;
  };

  PageMark._getTargetElm = function(x, y) {
    var elms = document.elementsFromPoint(x, y);
    for (var i = 0; i < elms.length; i++) {
      var e = elms[i];
      if (!PageMark._isOurUI(e) && e !== document.body && e !== document.documentElement && e.nodeType === 1) {
        return e;
      }
    }
    return null;
  };

  PageMark._onMouseMove = utils.throttle(function(e) {
    if (!PageMark.active) return;

    if (PageMark._dragStart && !PageMark._dragging) {
      var dx = e.clientX - PageMark._dragStart.x;
      var dy = e.clientY - PageMark._dragStart.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        PageMark._dragging = true;
      }
    }

    if (PageMark._dragging && PageMark._dragStart) {
      PageMark._rectElm.style.display = 'block';
      var left = Math.min(PageMark._dragStart.x, e.clientX);
      var top = Math.min(PageMark._dragStart.y, e.clientY);
      var w = Math.abs(e.clientX - PageMark._dragStart.x);
      var h = Math.abs(e.clientY - PageMark._dragStart.y);
      PageMark._rectElm.style.left = left + 'px';
      PageMark._rectElm.style.top = top + 'px';
      PageMark._rectElm.style.width = w + 'px';
      PageMark._rectElm.style.height = h + 'px';
      return;
    }

    if (PageMark.mode === 'element') {
      var elm = PageMark._getTargetElm(e.clientX, e.clientY);
      if (elm !== PageMark._hoverElm) {
        PageMark._hoverElm = elm;
        if (elm) {
          var r = elm.getBoundingClientRect();
          PageMark._hoverPreview.style.display = 'block';
          PageMark._hoverPreview.style.top = r.top + 'px';
          PageMark._hoverPreview.style.left = r.left + 'px';
          PageMark._hoverPreview.style.width = r.width + 'px';
          PageMark._hoverPreview.style.height = r.height + 'px';
        } else {
          PageMark._hoverPreview.style.display = 'none';
        }
      }
    } else if (PageMark.mode === 'text' && !PageMarkPopup.elm) {
      var wi = PageMark._getWordInfoAtPoint(e.clientX, e.clientY);
      if (wi) {
        var r2 = document.createRange();
        r2.setStart(wi.node, wi.startOffset);
        r2.setEnd(wi.node, wi.endOffset);
        var wr = r2.getBoundingClientRect();
        if (wr.width > 0) {
          PageMark._hoverPreview.style.display = 'block';
          PageMark._hoverPreview.style.top = wr.top + 'px';
          PageMark._hoverPreview.style.left = wr.left + 'px';
          PageMark._hoverPreview.style.width = wr.width + 'px';
          PageMark._hoverPreview.style.height = wr.height + 'px';
        } else {
          PageMark._hoverPreview.style.display = 'none';
        }
      } else {
        PageMark._hoverPreview.style.display = 'none';
      }
    }
  }, 16);

  PageMark._onMouseDown = function(e) {
    if (!PageMark.active) return;
    if (e.button !== 0) return;
    if (PageMark._isOurUI(e.target)) return;

    // Element / Text mode: no drag
    if (PageMark.mode === 'element' || PageMark.mode === 'text') {
      PageMark._dragStart = null;
      return;
    }

    PageMark._dragStart = { x: e.clientX, y: e.clientY };
    PageMark._dragging = false;
  };

  PageMark._onMouseUp = function(e) {
    if (!PageMark.active) return;

    if (PageMark.mode === 'text') {
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        PageMark._textDragCaptured = true;
        var text = sel.toString().trim();
        var range = sel.getRangeAt(0);
        var parentEl = range.commonAncestorContainer.nodeType === 3
          ? range.commonAncestorContainer.parentElement
          : range.commonAncestorContainer;
        if (parentEl && !PageMark._isOurUI(parentEl)) {
          sel.removeAllRanges();
          var ann = {
            id: utils.generateId(),
            mode: 'text',
            selectors: [Finder.generate(parentEl)],
            word: text,
            textContent: text,
            rect: null,
            file: null,
            fileAutoDetected: false,
            tagName: 'text',
            classes: [],
            domContext: '"' + text.slice(0, 50) + '"',
            action: 'consider',
            severity: 'should',
            note: '',
            images: [],
            texts: [],
            groupId: null,
            pageUrl: location.href,
            pageTitle: document.title,
            createdAt: Date.now(),
            status: 'open'
          };
          PageMark._lastSelectedWord = text;
          PageMark._textHighlightRange(range, text, parentEl);
          PageMark._showPopup(parentEl, ann);
        }
        return;
      }
    }

    if (!PageMark._dragStart) return;

    if (PageMark._dragging) {
      var rect = {
        x: Math.min(PageMark._dragStart.x, e.clientX),
        y: Math.min(PageMark._dragStart.y, e.clientY),
        width: Math.abs(e.clientX - PageMark._dragStart.x),
        height: Math.abs(e.clientY - PageMark._dragStart.y)
      };

      if (rect.width > 5 && rect.height > 5) {
        PageMark._wasDrag = true;
        PageMark._finishRectSelect(rect);
      }
    }

    PageMark._dragStart = null;
    PageMark._dragging = false;
    PageMark._rectElm.style.display = 'none';
  };

  PageMark._onClick = function(e) {
    if (!PageMark.active) return;
    if (PageMark._isOurUI(e.target)) return;

    if (PageMark._wasDrag) {
      PageMark._wasDrag = false;
      return;
    }

    if (PageMark._textDragCaptured) {
      PageMark._textDragCaptured = false;
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (PageMark.mode === 'element') {
      var elm = PageMark._getTargetElm(e.clientX, e.clientY);
      if (elm) {
        PageMark.selectElement(elm);
      }
    } else if (PageMark.mode === 'multi') {
      var elm = PageMark._getTargetElm(e.clientX, e.clientY);
      if (elm) PageMark.selectElementMulti(elm);
    } else if (PageMark.mode === 'text') {
      var wordInfo = PageMark._getWordInfoAtPoint(e.clientX, e.clientY);
      if (wordInfo) PageMark.selectText(wordInfo);
    }
  };

  PageMark._onDblClick = function(e) {
    if (!PageMark.active) return;
    if (PageMark._isOurUI(e.target)) return;

    var allElms = document.elementsFromPoint(e.clientX, e.clientY);
    var filtered = [];
    for (var i = 0; i < allElms.length; i++) {
      var el = allElms[i];
      if (!PageMark._isOurUI(el) && el !== document.body && el !== document.documentElement && el.nodeType === 1) {
        filtered.push(el);
      }
    }
    if (filtered.length === 0) return;

    if (!PageMark._dblClickStack || PageMark._dblClickStack[0] !== filtered[0]) {
      PageMark._dblClickStack = filtered;
      PageMark._dblClickIndex = 0;
    } else {
      PageMark._dblClickIndex = (PageMark._dblClickIndex + 1) % filtered.length;
    }

    var target = PageMark._dblClickStack[PageMark._dblClickIndex];
    PageMark.selectElement(target);

    var info = target.tagName.toLowerCase();
    if (target.id) {
      info += '#' + target.id;
    } else if (target.className && typeof target.className === 'string') {
      var cls = target.className.trim().split(/\s+/).filter(function(c) { return c; }).slice(0, 2).join('.');
      if (cls) info += '.' + cls;
    }
    PageMark._showToast('Selected: ' + info);
  };

  PageMark._onKeyDown = function(e) {
    if (!PageMark.active) return;
    if (e.key === 'Shift') PageMark.modifiers.shift = true;
    if (e.key === 'Control') PageMark.modifiers.ctrl = true;
    if (e.key === 'Meta') PageMark.modifiers.meta = true;
    if (e.key === 'a' && (PageMark.modifiers.ctrl || PageMark.modifiers.meta) && PageMark.mode === 'text') {
      e.preventDefault();
      if (PageMark._lastSelectedWord && PageMark._textHighlights.size > 0) {
        PageMark.selectAllSimilarWords(PageMark._lastSelectedWord);
      }
      return;
    }
    if (e.key === 'Escape') {
      var mm = document.getElementById('pagemark-match-menu');
      if (mm) { mm.remove(); return; }
      PageMarkPopup.hide();
      PageMark._clearMultiSelect();
      PageMark._hoverPreview.style.display = 'none';
    }
  };

  PageMark._onKeyUp = function(e) {
    if (!PageMark.active) return;
    if (e.key === 'Shift') PageMark.modifiers.shift = false;
    if (e.key === 'Control') PageMark.modifiers.ctrl = false;
    if (e.key === 'Meta') PageMark.modifiers.meta = false;
  };

  PageMark._onScroll = utils.throttle(function() {
    if (!PageMark.active) return;
    PageMark._refreshHighlights();
    PageMark._refreshTextHighlights();
    PageMark._refreshLabels();
    PageMark._hoverPreview.style.display = 'none';
  }, 100);

  PageMark._onResize = utils.debounce(function() {
    if (!PageMark.active) return;
    PageMark._refreshHighlights();
    PageMark._refreshTextHighlights();
    PageMark._refreshLabels();
  }, 200);

  PageMark._refreshLabels = function() {
    var container = document.getElementById('pagemark-container');
    if (!container) return;
    var labels = container.querySelectorAll('.pagemark-annotated-label');
    labels.forEach(function(l) {
      if (l._position) l._position();
    });
  };

  PageMark.selectElement = function(elm) {
    PageMark._multiAnn = null;
    PageMark.clearHighlights();
    PageMark.addHighlight(elm);

    var ann = {
      id: utils.generateId(),
      mode: 'element',
      selectors: [Finder.generate(elm)],
      xpaths: [Finder.toXPath(elm)],
      rect: null,
      file: null,
      fileAutoDetected: false,
      textContent: utils.truncate((elm.textContent || '').trim(), 200),
      tagName: elm.tagName.toLowerCase(),
      classes: Array.prototype.slice.call(elm.classList),
      domContext: PageMark._getDomContext(elm),
      action: 'consider',
      severity: 'should',
      note: '',
      images: [],
      texts: [],
      groupId: null,
      pageUrl: location.href,
      pageTitle: document.title,
      createdAt: Date.now(),
      status: 'open'
    };

    PageMark._showPopup(elm, ann);
  };

  PageMark.selectElementMulti = function(elm) {
    if (!PageMark._multiAnn) {
      PageMark.clearHighlights();
      PageMark.addHighlight(elm);
      PageMark._multiAnn = {
        id: utils.generateId(),
        mode: 'multi',
        selectors: [Finder.generate(elm)],
        xpaths: [Finder.toXPath(elm)],
        rect: null,
        file: null,
        fileAutoDetected: false,
        textContent: utils.truncate((elm.textContent || '').trim(), 200),
        tagName: elm.tagName.toLowerCase(),
        classes: Array.prototype.slice.call(elm.classList),
        domContext: PageMark._getDomContext(elm),
        action: 'consider',
        severity: 'should',
        note: '',
        images: [],
        texts: [],
        groupId: null,
        pageUrl: location.href,
        pageTitle: document.title,
        createdAt: Date.now(),
        status: 'open'
      };
    } else {
      PageMark.addHighlight(elm);
      PageMark._multiAnn.selectors.push(Finder.generate(elm));
      PageMark._multiAnn.xpaths.push(Finder.toXPath(elm));
      PageMark._multiAnn.domContext = PageMark._multiAnn.selectors.length + ' elements';
    }
    PageMarkPopup.hide();
    PageMarkToolbar.updateMultiSelectState();
  };

  PageMark._clearMultiSelect = function() {
    PageMark._multiAnn = null;
    PageMark.clearHighlights();
    PageMarkToolbar.updateMultiSelectState();
    PageMark._clearTextHighlights();
  };

  PageMark._finishRectSelect = function(rect) {
    var elms = PageMark._findElementsInRect(rect);
    if (elms.length === 0) return;

    PageMark.clearHighlights();
    var selectors = [];
    var xpaths = [];

    for (var i = 0; i < Math.min(elms.length, 20); i++) {
      PageMark.addHighlight(elms[i]);
      selectors.push(Finder.generate(elms[i]));
      xpaths.push(Finder.toXPath(elms[i]));
    }

    var ann = {
      id: utils.generateId(),
      mode: 'rectangle',
      selectors: selectors,
      xpaths: xpaths,
      rect: rect,
      file: null,
      fileAutoDetected: false,
      textContent: '',
      tagName: 'group',
      classes: [],
      domContext: elms.length + ' elements',
      action: 'consider',
      severity: 'should',
      note: '',
      images: [],
      texts: [],
      groupId: null,
      pageUrl: location.href,
      pageTitle: document.title,
      createdAt: Date.now(),
      status: 'open'
    };

    PageMark._showPopup(null, ann);
  };

  PageMark._findElementsInRect = function(rect) {
    var all = document.querySelectorAll('*');
    var result = [];
    var rx = rect.x, ry = rect.y, rw = rect.width, rh = rect.height;

    for (var i = 0; i < all.length; i++) {
      var elm = all[i];
      if (PageMark._isOurUI(elm)) continue;
      var r = elm.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left > rx + rw || r.right < rx || r.top > ry + rh || r.bottom < ry) continue;

      var ox = Math.max(0, Math.min(rx + rw, r.right) - Math.max(rx, r.left));
      var oy = Math.max(0, Math.min(ry + rh, r.bottom) - Math.max(ry, r.top));
      var overlap = ox * oy;
      var area = r.width * r.height;

      if (overlap > 0 && (overlap / area) >= 0.3) {
        result.push(elm);
      }
    }

    return result;
  };



  // selector mode removed

  PageMark._getDomContext = function(elm) {
    var parts = [];
    var node = elm;
    while (node && node.nodeType === 1 && parts.length < 4) {
      var s = node.tagName.toLowerCase();
      if (node.id) {
        s += '#' + node.id;
      } else if (node.className && typeof node.className === 'string') {
        var cls = node.className.trim().split(/\s+/).filter(function(c) {
          return c && !/^(flex|grid|mt-|mb-|ml-|mr-|w-|h-|p-|m-|gap-|text-|bg-|border-|rounded-|shadow-)/.test(c);
        });
        if (cls.length) s += '.' + cls.slice(0, 2).join('.');
      }
      parts.unshift(s);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };

  PageMark.addHighlight = function(elm, isAnnotated, action) {
    if (PageMark.highlightElms.has(elm)) return;
    var hl = document.createElement('div');
    hl.id = 'pagemark-highlight-' + utils.generateId();
    hl.className = (isAnnotated ? 'pagemark-annotated-highlight' : 'pagemark-highlight-item') + ' ' + (action || 'consider');
    var r = elm.getBoundingClientRect();
    hl.style.position = 'absolute';
    hl.style.top = r.top + 'px';
    hl.style.left = r.left + 'px';
    hl.style.width = r.width + 'px';
    hl.style.height = r.height + 'px';
    hl.style.pointerEvents = 'none';
    var container = document.getElementById('pagemark-container');
    if (container) container.appendChild(hl);
    PageMark.highlightElms.set(elm, hl);
    hl.dataset.annotated = isAnnotated ? 'true' : 'false';
    hl.dataset.action = action || 'consider';
  };

  PageMark.addAnnotatedLabel = function(elm, annotation) {
    var label = document.createElement('div');
    label.className = 'pagemark-annotated-label';
    label.dataset.pagemark = 'true';
    var action = annotation.action || 'consider';
    var sev = annotation.severity || 'should';
    var preview = annotation.note ? annotation.note.slice(0, 35) : '';
    var fullNote = annotation.note || '';
    var ACT_COLORS = { add: '#2563EB', modify: '#D97706', remove: '#DC2626', replace: '#7C3AED', fix: '#16A34A', consider: '#6B7280' };
    label.innerHTML = '<div class="pm-label-preview">' +
      '<span class="pm-label-dot" style="background:' + (ACT_COLORS[action] || '#000') + '"></span>' +
      '<span class="pm-label-action ' + _esc(action) + '">' + _esc(action) + '</span>' +
      '<span class="pm-label-severity ' + _esc(sev) + '">' + _esc(sev) + '</span>' +
      (preview ? '<span class="pm-label-note" title="' + _esc(fullNote) + '">' + _esc(preview) + '</span>' : '') +
      '</div>';

    var positionLabel = function() {
      var r = elm.getBoundingClientRect();
      var right = window.innerWidth - r.right;
      if (right < 220) {
        label.style.right = 'auto';
        label.style.left = (r.left + r.width + 8) + 'px';
      } else {
        label.style.left = 'auto';
        label.style.right = (right + 8) + 'px';
      }
      label.style.top = Math.max(4, Math.min(r.top + r.height/2 - 10, window.innerHeight - 30)) + 'px';
    };
    positionLabel();
    label._position = positionLabel;

    label.onclick = function() {
      PageMarkPopup.show(elm, annotation);
    };

    document.getElementById('pagemark-container').appendChild(label);
    return label;
  };

  PageMark.clearHighlights = function() {
    var toRemove = [];
    PageMark.highlightElms.forEach(function(hl, elm) {
      if (hl.dataset && hl.dataset.annotated === 'true') return; // keep annotated
      toRemove.push(hl);
    });
    toRemove.forEach(function(hl) {
      PageMark.highlightElms.forEach(function(h, elm) {
        if (h === hl) { PageMark.highlightElms.delete(elm); }
      });
      if (hl.parentNode) hl.remove();
    });
  };

  PageMark._refreshHighlights = function() {
    PageMark.highlightElms.forEach(function(hl, elm) {
      if (!document.contains(elm)) {
        hl.remove();
        PageMark.highlightElms.delete(elm);
        return;
      }
      var r = elm.getBoundingClientRect();
      hl.style.top = r.top + 'px';
      hl.style.left = r.left + 'px';
      hl.style.width = r.width + 'px';
      hl.style.height = r.height + 'px';
    });
  };

  PageMark._refreshTextHighlights = function() {
    PageMark._textHighlights.forEach(function(info, overlay) {
      if (!document.contains(info.parentEl)) {
        overlay.remove();
        PageMark._textHighlights.delete(overlay);
        return;
      }
      try {
        var range = info.range;
        var r = range.getBoundingClientRect();
        overlay.style.top = r.top + 'px';
        overlay.style.left = r.left + 'px';
        overlay.style.width = r.width + 'px';
        overlay.style.height = r.height + 'px';
      } catch(e) {}
    });
  };

  PageMark._getWordInfoAtPoint = function(x, y) {
    var range;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      var pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
    if (!range) return null;
    var node = range.startContainer;
    if (!node || node.nodeType !== 3) return null;
    var offset = range.startOffset;
    var wordInfo = utils.getWordAtOffset(node, offset);
    if (!wordInfo) return null;
    var parent = node.parentElement;
    if (PageMark._isOurUI(parent)) return null;
    return {
      node: node,
      parentEl: parent,
      startOffset: wordInfo.startOffset,
      endOffset: wordInfo.endOffset,
      word: wordInfo.word
    };
  };

  PageMark._textHighlightWord = function(info) {
    var range = document.createRange();
    range.setStart(info.node, info.startOffset);
    range.setEnd(info.node, info.endOffset);
    var r = range.getBoundingClientRect();
    var overlay = document.createElement('div');
    overlay.className = 'pagemark-text-highlight';
    overlay.style.position = 'absolute';
    overlay.style.top = r.top + 'px';
    overlay.style.left = r.left + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    overlay.style.pointerEvents = 'none';
    overlay.dataset.word = info.word;
    var container = document.getElementById('pagemark-container');
    if (container) container.appendChild(overlay);
    PageMark._textHighlights.set(overlay, {
      range: range,
      parentEl: info.parentEl,
      word: info.word
    });
    return overlay;
  };

  PageMark._clearTextHighlights = function() {
    var toRemove = [];
    PageMark._textHighlights.forEach(function(info, overlay) {
      if (overlay.dataset && overlay.dataset.annotated === 'true') return;
      toRemove.push(overlay);
    });
    toRemove.forEach(function(overlay) {
      PageMark._textHighlights.delete(overlay);
      if (overlay.parentNode) overlay.remove();
    });
  };

  PageMark._removeAllTextHighlights = function() {
    PageMark._textHighlights.forEach(function(info, overlay) {
      if (overlay.parentNode) overlay.remove();
    });
    PageMark._textHighlights.clear();
  };

  PageMark._textHighlightRange = function(range, text, parentEl) {
    PageMark._clearTextHighlights();
    var r = range.getBoundingClientRect();
    var overlay = document.createElement('div');
    overlay.className = 'pagemark-text-highlight';
    overlay.style.position = 'absolute';
    overlay.style.top = r.top + 'px';
    overlay.style.left = r.left + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    overlay.style.pointerEvents = 'none';
    overlay.dataset.word = text;
    var container = document.getElementById('pagemark-container');
    if (container) container.appendChild(overlay);
    PageMark._textHighlights.set(overlay, {
      range: range,
      parentEl: parentEl,
      word: text
    });
  };

  PageMark.selectText = function(wordInfo) {
    PageMark._clearTextHighlights();
    PageMark.clearHighlights();
    PageMarkPopup.hide();

    PageMark._textHighlightWord(wordInfo);
    PageMark._lastSelectedWord = wordInfo.word;

    var ann = {
      id: utils.generateId(),
      mode: 'text',
      selectors: [Finder.generate(wordInfo.parentEl)],
      word: wordInfo.word,
      textContent: wordInfo.word,
      wordRange: { startOffset: wordInfo.startOffset, endOffset: wordInfo.endOffset },
      rect: null,
      file: null,
      fileAutoDetected: false,
      tagName: 'text',
      classes: [],
      domContext: '"' + wordInfo.word + '"',
      action: 'consider',
      severity: 'should',
      note: '',
      images: [],
      texts: [],
      groupId: null,
      pageUrl: location.href,
      pageTitle: document.title,
      createdAt: Date.now(),
      status: 'open'
    };

    PageMark._showPopup(null, ann);
  };

  PageMark.selectAllSimilarWords = function(word) {
    PageMark._clearTextHighlights();
    PageMark.clearHighlights();
    PageMarkPopup.hide();

    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var infos = [];
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if (PageMark._isOurUI(node.parentElement)) continue;
      var text = node.textContent || '';
      var idx = 0;
      while (idx < text.length) {
        var found = text.indexOf(word, idx);
        if (found === -1) break;
        var isWord = true;
        if (found > 0 && /\w/.test(text[found - 1])) isWord = false;
        if (found + word.length < text.length && /\w/.test(text[found + word.length])) isWord = false;
        if (isWord) {
          var range = document.createRange();
          range.setStart(node, found);
          range.setEnd(node, found + word.length);
          var r = range.getBoundingClientRect();
          if (r.width > 0) {
            infos.push({ node: node, startOffset: found, endOffset: found + word.length, word: word, parentEl: node.parentElement });
          }
        }
        idx = found + 1;
      }
    }

    if (infos.length === 0) {
      PageMark._showToast('No other occurrences of "' + word + '" found');
      return;
    }

    infos.forEach(function(info) { PageMark._textHighlightWord(info); });

    var selectors = [];
    var seen = {};
    infos.forEach(function(info) {
      var sel = Finder.generate(info.parentEl);
      if (!seen[sel]) { seen[sel] = true; selectors.push(sel); }
    });

    var ann = {
      id: utils.generateId(),
      mode: 'text',
      selectors: selectors,
      word: word,
      textContent: word,
      wordRange: null,
      rect: null,
      file: null,
      fileAutoDetected: false,
      tagName: 'text',
      classes: [],
      domContext: infos.length + ' occurrences of "' + word + '"',
      action: 'consider',
      severity: 'should',
      note: '',
      images: [],
      texts: [],
      groupId: null,
      pageUrl: location.href,
      pageTitle: document.title,
      createdAt: Date.now(),
      status: 'open'
    };

    PageMark._showPopup(null, ann);
    PageMark._showToast('Found ' + infos.length + ' occurrences');
  };

  PageMark.addAnnotation = function(data) {
    PageMark.annotations.push(data);
    PageMarkToolbar.updateBadge(PageMark.annotations.length);
    PageMark._multiAnn = null;
    PageMarkToolbar.updateMultiSelectState();

    data._labelElms = [];

    if (data.mode === 'text') {
      PageMark._textHighlights.forEach(function(info, overlay) {
        if (overlay.dataset && overlay.dataset.annotated !== 'true') {
          overlay.className = 'pagemark-text-highlight annotated ' + (data.action || 'consider');
          overlay.dataset.annotated = 'true';
          overlay.dataset.action = data.action || 'consider';
          var label = PageMark.addAnnotatedLabel(info.parentEl, data);
          data._labelElms.push(label);
        }
      });
    } else {
      PageMark.highlightElms.forEach(function(hl, elm) {
        if (hl.dataset && hl.dataset.annotated !== 'true') {
          hl.className = 'pagemark-annotated-highlight ' + (data.action || 'consider');
          hl.dataset.annotated = 'true';
          hl.dataset.action = data.action || 'consider';
          var label = PageMark.addAnnotatedLabel(elm, data);
          data._labelElms.push(label);
        }
      });
    }

    return data;
  };

  PageMark.removeAnnotation = function(id) {
    for (var i = 0; i < PageMark.annotations.length; i++) {
      if (PageMark.annotations[i].id === id) {
        var ann = PageMark.annotations[i];
        if (ann._labelElms) {
          ann._labelElms.forEach(function(l) { l.remove(); });
        }
        if (ann.mode === 'text') {
          ann.selectors.forEach(function(sel) {
            PageMark._textHighlights.forEach(function(info, overlay) {
              try {
                if (document.querySelector(sel) === info.parentEl) {
                  overlay.remove();
                  PageMark._textHighlights.delete(overlay);
                }
              } catch(e) {}
            });
          });
        }
        PageMark.annotations.splice(i, 1);
        break;
      }
    }
    PageMarkToolbar.updateBadge(PageMark.annotations.length);
  };

  PageMark.updateAnnotation = function(id, updates) {
    for (var i = 0; i < PageMark.annotations.length; i++) {
      if (PageMark.annotations[i].id === id) {
        var ann = PageMark.annotations[i];
        for (var k in updates) {
          if (updates.hasOwnProperty(k)) {
            ann[k] = updates[k];
          }
        }
        // Re-render all label bubbles
        if (ann._labelElms) {
          ann._labelElms.forEach(function(l) { l.remove(); });
          ann._labelElms = [];
          if (ann.selectors) {
            ann.selectors.forEach(function(sel) {
              try {
                var elm = document.querySelector(sel);
                if (elm && document.contains(elm)) {
                  var label = PageMark.addAnnotatedLabel(elm, ann);
                  ann._labelElms.push(label);
                }
              } catch(e) {}
            });
          }
        }
        return ann;
      }
    }
    return null;
  };

  PageMark._showPopup = function(elm, annotation) {
    PageMarkPopup.show(elm, annotation);
    setTimeout(function() {
      var popup = PageMarkPopup.elm;
      if (!popup) return;
      var rect = popup.getBoundingClientRect();
      var vh = window.innerHeight;
      var vw = window.innerWidth;
      var sy = window.scrollY || window.pageYOffset || 0;
      var sx = window.scrollX || window.pageXOffset || 0;
      if (rect.bottom > vh - 12) {
        popup.style.top = (Math.max(12, vh - rect.height - 12) + sy) + 'px';
        popup.style.maxHeight = (vh - 24) + 'px';
      }
      if (rect.right > vw - 12) {
        popup.style.left = (Math.max(12, vw - rect.width - 12) + sx) + 'px';
      }
      if (rect.left < sx + 12) {
        popup.style.left = (sx + 12) + 'px';
      }
    }, 0);
  };

  PageMark._startObserver = function() {
    if (PageMark._observer) return;
    PageMark._lastUrl = location.href;
    PageMark._lastTitle = document.title;

    PageMark._checkNav = utils.debounce(function() {
      if (location.href !== PageMark._lastUrl || document.title !== PageMark._lastTitle) {
        PageMark._lastUrl = location.href;
        PageMark._lastTitle = document.title;
        PageMark._onSPANav();
      }
    }, 500);

    window.addEventListener('popstate', PageMark._checkNav);
    PageMark._observer = new MutationObserver(PageMark._checkNav);
    PageMark._observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  PageMark._stopObserver = function() {
    if (PageMark._observer) {
      PageMark._observer.disconnect();
      PageMark._observer = null;
    }
    if (PageMark._checkNav) {
      window.removeEventListener('popstate', PageMark._checkNav);
      PageMark._checkNav = null;
    }
  };

  PageMark._onSPANav = function() {
    PageMark.annotations = [];
    var c = document.getElementById('pagemark-container');
    if (c) c.querySelectorAll('.pagemark-annotated-label').forEach(function(l) { l.remove(); });
    PageMark.highlightElms.forEach(function(hl) { hl.remove(); });
    PageMark.highlightElms.clear();
    PageMark._removeAllTextHighlights();
    PageMarkPopup.hide();
    PageMarkToolbar.updateBadge(0);
    PageMark.sendMessage({ type: 'ANNOTATION_DELETED_ALL' });
    PageMark._showToast('Page changed — annotations reset');
  };

  PageMark._showToast = function(msg) {
    var existing = document.getElementById('pagemark-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'pagemark-toast';
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#0F172A;color:#F1F5F9;padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);font-size:13px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.2);opacity:0;transition:opacity 0.2s';
    document.getElementById('pagemark-container').appendChild(toast);

    requestAnimationFrame(function() {
      toast.style.opacity = '1';
    });

    setTimeout(function() {
      toast.style.opacity = '0';
      setTimeout(function() { toast.remove(); }, 200);
    }, 2500);
  };

  PageMark.sendMessage = function(msg, cb) {
    try {
      chrome.runtime.sendMessage(msg, cb || function(){});
    } catch(e) {}
  };

  PageMark.modifiers = { shift: false, ctrl: false, meta: false };

  PageMark.init();

  // Handshake: tell background we're ready; it responds with current activation state
  try {
    chrome.runtime.sendMessage({ type: 'PAGEMARK_CONTENT_READY' }, function(resp) {
      if (resp && resp.active && !PageMark.active) {
        PageMark.activate();
      } else if (resp && !resp.active && PageMark.active) {
        PageMark.deactivate();
      }
    });
  } catch(e) {}

  chrome.storage.local.get('projectRoot', function(r) {
    if (r.projectRoot) {
      FileDetector.setProjectRoot(r.projectRoot);
    } else {
      // Try auto-detect the project root from window location
      var detected = FileDetector.autoDetectProjectRoot();
      if (detected) {
        FileDetector.setProjectRoot(detected);
        chrome.storage.local.set({ projectRoot: detected });
      }
    }
  });

  function _esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }
})();
