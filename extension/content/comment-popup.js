var PageMarkPopup = PageMarkPopup || {};

(function() {
  PageMarkPopup.elm = null;
  PageMarkPopup.currentElement = null;
  PageMarkPopup.currentAnnotation = null;
  PageMarkPopup._isEditing = false;

  var KeywordSuggester = typeof KeywordSuggester !== 'undefined' ? KeywordSuggester : {};
  KeywordSuggester.suggest = KeywordSuggester.suggest || function(note) {
    var lower = note.toLowerCase();
    var action = null;
    if (/creat|new|insert|append|implement|add/.test(lower)) action = 'add';
    else if (/chang|updat|edit|adjust|refactor|modif/.test(lower)) action = 'modify';
    else if (/delet|remov|drop|strip|eliminate/.test(lower)) action = 'remove';
    else if (/swap|substitut|exchang|migrate/.test(lower)) action = 'replace';
    else if (/bug|broken|error|issue|incorrect|fix/.test(lower)) action = 'fix';
    else if (/review|check|consider|evaluat|audit/.test(lower)) action = 'consider';

    var severity = null;
    if (/critical|blocker|urgent|security|broken|crashes|wrong|must/.test(lower)) severity = 'must';
    else if (/should|could|maybe|consider|nice/.test(lower)) severity = 'should';

    return { action: action, severity: severity };
  };

  var FileDetector = typeof FileDetector !== 'undefined' ? FileDetector : {};
  FileDetector.detect = FileDetector.detect || function(elm) {
    if (typeof detectSourceFile === 'function') {
      return detectSourceFile(elm.textContent || '', location.href);
    }
    var match = location.pathname.match(/\/([\w.-]+)$/);
    return { file: match ? match[1] : null, autoDetected: !!match };
  };

  PageMarkPopup.show = function(elm, annotation) {
    PageMarkPopup.hide();
    PageMarkPopup.currentElement = elm;
    PageMarkPopup.currentAnnotation = annotation;
    PageMarkPopup._isEditing = annotation && annotation.note && annotation.note.length > 0;

    var popup = document.createElement('div');
    popup.id = 'pagemark-popup';
    PageMarkPopup.elm = popup;

    PageMarkPopup._render(popup, elm, annotation);
    PageMarkPopup._position(popup, elm);

    document.body.appendChild(popup);

    PageMarkPopup._bindEvents(popup, annotation);
    PageMarkPopup._setupAutoSuggest(popup);
  };

  PageMarkPopup.hide = function() {
    if (PageMarkPopup.elm) {
      PageMarkPopup.elm.remove();
      PageMarkPopup.elm = null;
    }
    PageMarkPopup.currentElement = null;
    PageMarkPopup.currentAnnotation = null;
    PageMarkPopup._isEditing = false;
  };

  PageMarkPopup._position = function(popup, elm) {
    popup.style.position = 'absolute';
    var sx = window.scrollX || window.pageXOffset || 0;
    var sy = window.scrollY || window.pageYOffset || 0;
    var popupW = 360;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    if (elm) {
      var rect = elm.getBoundingClientRect();
      var left = rect.right + 12;
      var top = rect.top;

      if (left + popupW > vw - 12) {
        left = rect.left - popupW - 12;
      }
      if (left < 12) left = 12;
      if (left + popupW > vw - 12) left = vw - popupW - 12;

      if (top + 350 > vh - 12) {
        top = vh - 350 - 12;
      }
      if (top < 12) top = 12;

      popup.style.top = (top + sy) + 'px';
      popup.style.left = (left + sx) + 'px';
    } else {
      popup.style.top = (Math.max(12, vh / 2 - 210) + sy) + 'px';
      popup.style.left = (Math.max(12, (vw - popupW) / 2) + sx) + 'px';
    }
  };

  PageMarkPopup._render = function(popup, elm, annotation) {
    var fileInfo = { file: annotation.file, autoDetected: annotation.fileAutoDetected };
    if (!fileInfo.file) {
      if (elm) {
        var detected = FileDetector.detect(elm);
        fileInfo = detected;
      }
      if (!fileInfo.file && annotation.selectors && annotation.selectors.length > 0) {
        try {
          var firstElm = document.querySelector(annotation.selectors[0]);
          if (firstElm) {
            var detected = FileDetector.detect(firstElm);
            if (detected && detected.file) fileInfo = detected;
          }
        } catch(e) {}
      }
    }

    var selector = annotation.selectors && annotation.selectors.length > 0 ? annotation.selectors[0] : '';
    var content = annotation.textContent || (elm ? utils.truncate((elm.textContent || '').trim(), 200) : '');
    var context = annotation.domContext || '';

    var multiCount = annotation.selectors ? annotation.selectors.length : 1;

    var headerHtml = '<div class="pm-pop-header">' +
      (multiCount > 1 ? multiCount + ' elements selected' : 'PageMark Annotation') +
      '</div>';

    var fileHtml = '<div class="pm-pop-section">' +
      '<div class="pm-pop-label">Source File</div>' +
      '<div class="pm-pop-filepath">' + _esc(fileInfo.file || '—') + '</div>' +
      '</div>';

    var selHtml = '';
    if (selector) {
      selHtml = '<div class="pm-pop-section">' +
        '<div class="pm-pop-label">Selector (' + multiCount + ')</div>' +
        '<div class="pm-pop-selector">' + _esc(selector) + '</div>' +
        '</div>';
    }

    var ctxHtml = '';
    if (context) {
      ctxHtml = '<div class="pm-pop-section">' +
        '<div class="pm-pop-label">Context</div>' +
        '<div class="pm-pop-content">' + _esc(context) + '</div>' +
        '</div>';
    }

    var contentHtml = '';
    if (content) {
      contentHtml = '<div class="pm-pop-section">' +
        '<div class="pm-pop-label">Content</div>' +
        '<div class="pm-pop-content">' + _esc(content) + '</div>' +
        '</div>';
    }

    var actionHtml = '<div class="pm-pop-section">' +
      '<div class="pm-pop-label">Action</div>' +
      '<div class="pm-pill-group" id="pm-action-group">';

    var actions = utils.ACTIONS || ['add','modify','remove','replace','fix','consider'];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      var activeClass = a === annotation.action ? ' active' : '';
      actionHtml += '<button class="pm-pill' + activeClass + '" data-action="' + a + '">' + a + '</button>';
    }
    actionHtml += '</div></div>';

    var sevHtml = '<div class="pm-pop-section">' +
      '<div class="pm-pop-label">Severity</div>' +
      '<div class="pm-pill-group" id="pm-sev-group">';

    var sevs = utils.SEVERITIES || ['must','should','nit'];
    for (var j = 0; j < sevs.length; j++) {
      var s = sevs[j];
      var activeClass = s === annotation.severity ? ' active' : '';
      sevHtml += '<button class="pm-pill ' + s + activeClass + '" data-severity="' + s + '">' + s + '</button>';
    }
    sevHtml += '</div></div>';

    var imagesHtml = '<div class="pm-pop-section">' +
      '<div class="pm-pop-label">Image Paths</div>' +
      '<div id="pm-images-list"></div>' +
      '<button class="pm-pop-add-btn" id="pm-add-image">+ Add Image</button>' +
      '</div>';

    var textsHtml = '<div class="pm-pop-section">' +
      '<div class="pm-pop-label">Text to Inject</div>' +
      '<div id="pm-texts-list"></div>' +
      '<button class="pm-pop-add-btn" id="pm-add-text">+ Add Text</button>' +
      '</div>';

    var noteHtml = '<div class="pm-pop-note">' +
      '<textarea id="pm-note-text" placeholder="Describe what needs to change..." maxlength="2000">' +
      _esc(annotation.note || '') +
      '</textarea>' +
      '<div class="pm-suggest" id="pm-suggest"></div>' +
      '</div>';

    var isEditing = PageMarkPopup._isEditing;
    var actionHtml2 = '<div class="pm-pop-actions">' +
      '<button class="pm-btn-save" id="pm-btn-save">' + (isEditing ? 'Update' : 'Save') + '</button>' +
      '<button class="pm-btn-cancel" id="pm-btn-cancel">Cancel</button>' +
      '<button class="pm-btn-delete" id="pm-btn-delete">Remove</button>' +
      '</div>';

    popup.innerHTML = headerHtml + fileHtml + selHtml + ctxHtml + contentHtml + actionHtml + sevHtml + imagesHtml + textsHtml + noteHtml + actionHtml2;
  };

  PageMarkPopup._bindEvents = function(popup, annotation) {
    document.getElementById('pm-btn-save').onclick = PageMarkPopup._onSave;
    document.getElementById('pm-btn-cancel').onclick = PageMarkPopup._onCancel;
    document.getElementById('pm-btn-delete').onclick = PageMarkPopup._onDelete;

    var actionGroup = document.getElementById('pm-action-group');
    if (actionGroup) {
      actionGroup.addEventListener('click', function(e) {
        var btn = e.target.closest('.pm-pill');
        if (!btn || !btn.dataset.action) return;
        actionGroup.querySelectorAll('.pm-pill').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    }

    var sevGroup = document.getElementById('pm-sev-group');
    if (sevGroup) {
      sevGroup.addEventListener('click', function(e) {
        var btn = e.target.closest('.pm-pill');
        if (!btn || !btn.dataset.severity) return;
        sevGroup.querySelectorAll('.pm-pill').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    }

    // Populate existing images
    var imagesList = document.getElementById('pm-images-list');
    if (imagesList && annotation.images) {
      annotation.images.forEach(function(path) { PageMarkPopup._addImageRow(imagesList, path); });
    }
    document.getElementById('pm-add-image').onclick = function() {
      PageMarkPopup._addImageRow(document.getElementById('pm-images-list'), '');
    };

    // Populate existing texts
    var textsList = document.getElementById('pm-texts-list');
    if (textsList && annotation.texts) {
      annotation.texts.forEach(function(t) { PageMarkPopup._addTextRow(textsList, t); });
    }
    document.getElementById('pm-add-text').onclick = function() {
      PageMarkPopup._addTextRow(document.getElementById('pm-texts-list'), '');
    };
  };

  PageMarkPopup._addImageRow = function(container, value) {
    var row = document.createElement('div');
    row.className = 'pm-pop-attach-row';
    row.innerHTML =
      '<input type="text" placeholder="src/assets/..." value="' + _esc(value) + '">' +
      '<button class="pm-pop-remove-row" title="Remove">&times;</button>';
    row.querySelector('.pm-pop-remove-row').onclick = function() { row.remove(); };
    container.appendChild(row);
  };

  PageMarkPopup._addTextRow = function(container, value) {
    var row = document.createElement('div');
    row.className = 'pm-pop-attach-row';
    row.innerHTML =
      '<textarea placeholder="Text to inject..." rows="2">' + _esc(value) + '</textarea>' +
      '<button class="pm-pop-remove-row" title="Remove">&times;</button>';
    row.querySelector('.pm-pop-remove-row').onclick = function() { row.remove(); };
    container.appendChild(row);
  };

  PageMarkPopup._setupAutoSuggest = function(popup) {
    var textarea = document.getElementById('pm-note-text');
    if (!textarea) return;

    var suggestContainer = document.getElementById('pm-suggest');

    var handler = utils.debounce(function() {
      var note = textarea.value.trim();
      if (note.length < 3) {
        suggestContainer.innerHTML = '';
        return;
      }

      var result = KeywordSuggester.suggest(note);
      if (!result) {
        suggestContainer.innerHTML = '';
        return;
      }

      var html = '';
      if (result.action) {
        html += '<span class="pm-suggest-pill">action: ' + result.action + '</span>';
      }
      if (result.severity) {
        html += '<span class="pm-suggest-pill">severity: ' + result.severity + '</span>';
      }

      suggestContainer.innerHTML = html;

      if (result.action) {
        var actionBtns = popup.querySelectorAll('#pm-action-group .pm-pill');
        actionBtns.forEach(function(b) {
          b.classList.toggle('active', b.dataset.action === result.action);
        });
      }
      if (result.severity) {
        var sevBtns = popup.querySelectorAll('#pm-sev-group .pm-pill');
        sevBtns.forEach(function(b) {
          b.classList.toggle('active', b.dataset.severity === result.severity);
        });
      }
    }, 300);

    textarea.addEventListener('input', handler);
  };

  PageMarkPopup._onSave = function() {
    var textarea = document.getElementById('pm-note-text');
    if (!textarea) return;

    var note = textarea.value.trim();

    var actionEl = document.querySelector('#pm-action-group .pm-pill.active');
    var sevEl = document.querySelector('#pm-sev-group .pm-pill.active');

    var annotation = PageMarkPopup.currentAnnotation;
    if (!annotation) return;

    annotation.note = note;
    if (actionEl) annotation.action = actionEl.dataset.action;
    if (sevEl) annotation.severity = sevEl.dataset.severity;

    // Collect image paths
    annotation.images = [];
    var imageRows = document.querySelectorAll('#pm-images-list .pm-pop-attach-row input');
    imageRows.forEach(function(inp) {
      var v = inp.value.trim();
      if (v) annotation.images.push(v);
    });

    // Collect text values
    annotation.texts = [];
    var textRows = document.querySelectorAll('#pm-texts-list .pm-pop-attach-row textarea');
    textRows.forEach(function(ta) {
      var v = ta.value.trim();
      if (v) annotation.texts.push(v);
    });

    annotation.status = 'open';

    if (!PageMarkPopup._isEditing) {
      PageMark.addAnnotation(annotation);
    } else {
      PageMark.updateAnnotation(annotation.id, {
        note: annotation.note,
        action: annotation.action,
        severity: annotation.severity,
        file: annotation.file,
        images: annotation.images,
        texts: annotation.texts,
        status: annotation.status
      });
    }

    // Add annotated highlight/label
    PageMark.highlightElms.forEach(function(hl, elm) {
      if (hl.dataset) hl.dataset.annotated = 'true';
    });

    PageMark.sendMessage({ type: 'ANNOTATION_SAVED', annotation: annotation });

    PageMark._showToast('Annotation saved');
    PageMarkPopup.hide();
  };

  PageMarkPopup._onCancel = function() {
    PageMarkPopup.hide();
    PageMark._clearMultiSelect();
    PageMark._clearTextHighlights();
  };

  PageMarkPopup._onDelete = function() {
    var annotation = PageMarkPopup.currentAnnotation;
    if (!annotation) return;

    if (PageMarkPopup._isEditing || true) {
      PageMark.removeAnnotation(annotation.id);
      PageMark.sendMessage({ type: 'ANNOTATION_DELETED', id: annotation.id });
      if (annotation._labelElm) annotation._labelElm.remove();
      PageMark.highlightElms.forEach(function(hl, elm) {
        if (hl.dataset && hl.dataset.annotated === 'true') {
          var sel = annotation.selectors && annotation.selectors[0];
          if (sel) {
            try {
              var match = document.querySelector(sel);
              if (match === elm) {
                hl.remove();
                PageMark.highlightElms.delete(elm);
              }
            } catch(e) {}
          }
        }
      });
    }

    PageMarkPopup.hide();
    PageMark.clearHighlights();
  };

  function _esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }
})();
