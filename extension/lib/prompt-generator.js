var PromptGenerator = PromptGenerator || {};

var SEVERITY_ORDER = { must: 0, should: 1, nit: 2 };

PromptGenerator.escapeMd = function escapeMd(str) {
  if (!str) return '';
  return String(str).replace(/\|/g, '\\|').replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/`/g, '\\`');
};

PromptGenerator.generate = function generate(annotations, options) {
  options = options || {};
  var projectRoot = options.projectRoot || '';
  var pageTitle = options.pageTitle || 'Untitled';
  var pageUrl = options.pageUrl || '';
  var timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

  if (!annotations || !annotations.length) {
    return '# PageMark Analysis: ' + pageTitle + '\n\nNo annotations found for this page.';
  }

  var openAnnotations = annotations.filter(function (a) { return a.status !== 'resolved'; });
  if (!openAnnotations.length) {
    return '# PageMark Analysis: ' + pageTitle + '\n\nAll annotations have been resolved.';
  }

  var grouped = {};
  openAnnotations.forEach(function (ann) {
    var file = ann.file || '__unknown__';
    if (!grouped[file]) grouped[file] = [];
    grouped[file].push(ann);
  });

  var fileKeys = Object.keys(grouped).sort(function (a, b) {
    if (a === '__unknown__') return 1;
    if (b === '__unknown__') return -1;
    return a.localeCompare(b);
  });

  var counts = { must: 0, should: 0, nit: 0 };
  openAnnotations.forEach(function (ann) {
    var sev = ann.severity || 'should';
    if (counts[sev] !== undefined) counts[sev]++;
  });
  var total = counts.must + counts.should + counts.nit;

  var lines = [];

  // --- Title ---
  lines.push('# PageMark Analysis: ' + pageTitle);
  lines.push('');

  // --- Instructions ---
  lines.push('## Instructions');
  lines.push('');
  lines.push('You are an AI coding agent. Your task is to implement the annotations below on the codebase. Read all annotations first, then apply them file by file.');
  lines.push('');
  lines.push('### Severity (apply in order)');
  lines.push('');
  lines.push('- **[MUST]** — Required. Code is incorrect or broken without this. Implement first.');
  lines.push('- **[SHOULD]** — Recommended. Important improvement. Apply after all MUST items.');
  lines.push('- **[NIT]** — Optional polish. Only implement after MUST and SHOULD are done.');
  lines.push('');
  lines.push('### Actions');
  lines.push('');
  lines.push('| Action | What to do |');
  lines.push('|--------|------------|');
  lines.push('| `add` | Insert new code. Place it near related existing code. |');
  lines.push('| `modify` | Change existing code. Keep everything not mentioned in the note. |');
  lines.push('| `remove` | Delete code. Check for dangling references after removal. |');
  lines.push('| `replace` | Swap entire block or file. Delete old, write new. |');
  lines.push('| `fix` | Correct a bug. Fix the logic, not just the symptom. |');
  lines.push('| `consider` | Evaluate the suggestion. Implement it or explain why you chose not to. |');
  lines.push('| `reference` | Use this element as a reference for style, pattern, or approach. Do not modify — learn from it. |');
  lines.push('');
  lines.push('### Rules');
  lines.push('');
  lines.push('- If a CSS selector does not match the codebase, use the annotation note and element context to infer the correct location.');
  lines.push('- Ask clarifying questions if an annotation is ambiguous or impossible to implement.');
  lines.push('- Output the final code. Make the changes, do not describe them.');
  lines.push('');

  // --- Overview ---
  lines.push('## Overview');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push('| Generated | ' + timestamp + ' |');
  if (pageUrl) lines.push('| Page URL | `' + pageUrl + '` |');
  if (projectRoot) lines.push('| Project Root | `' + projectRoot + '` |');
  lines.push('| Total | ' + total + ' (' + counts.must + ' MUST, ' + counts.should + ' SHOULD, ' + counts.nit + ' NIT) |');
  lines.push('');

  // --- Per-file sections ---
  lines.push('## Changes');
  lines.push('');

  fileKeys.forEach(function (file) {
    var group = grouped[file];
    group.sort(function (a, b) {
      var sa = SEVERITY_ORDER[a.severity] !== undefined ? SEVERITY_ORDER[a.severity] : 1;
      var sb = SEVERITY_ORDER[b.severity] !== undefined ? SEVERITY_ORDER[b.severity] : 1;
      return sa - sb;
    });

    var fileCount = group.length;
    var fileMust = 0, fileShould = 0, fileNit = 0;
    group.forEach(function (a) {
      var s = a.severity || 'should';
      if (s === 'must') fileMust++;
      else if (s === 'should') fileShould++;
      else fileNit++;
    });

    var sevSummary = [];
    if (fileMust > 0) sevSummary.push(fileMust + ' MUST');
    if (fileShould > 0) sevSummary.push(fileShould + ' SHOULD');
    if (fileNit > 0) sevSummary.push(fileNit + ' NIT');

    lines.push('### ' + (file === '__unknown__' ? 'Unknown File' : 'File: `' + file + '`') +
      ' (' + fileCount + ' annotation' + (fileCount > 1 ? 's' : '') + ': ' + sevSummary.join(', ') + ')');

    if (file === '__unknown__') {
      lines.push('');
      lines.push('_The source file was not specified. Use the element context and CSS selectors to identify the correct file._');
    }
    lines.push('');

    group.forEach(function (ann) {
      var sev = ann.severity || 'should';
      var action = ann.action || 'modify';
      var note = ann.note || '';
      var selector = ann.selectors && ann.selectors.length ? ann.selectors[0] : '';
      var context = ann.domContext || '';
      var textContent = ann.textContent || '';
      var tagName = ann.tagName || '';

      var sevBadge = sev === 'must' ? '[MUST]' : sev === 'should' ? '[SHOULD]' : '[NIT]';
      var title = sevBadge + ' ' + action.charAt(0).toUpperCase() + action.slice(1) +
        (textContent ? ' — "' + textContent.slice(0, 50) + '"' : '') +
        (selector ? ' ' + selector : '');

      lines.push('**' + title + '**');
      lines.push('');
      if (action === 'reference') {
        lines.push('- **Purpose:** Reference \u2014 use as reference, do not modify');
      }
      if (note) lines.push('- **Note:** ' + note);
      if (ann.mode === 'text') {
        lines.push('- **Type:** Text Selection');
      }
      if (ann.file) lines.push('- **File:** `' + ann.file.replace(/`/g, '\\`') + '`');
      if (selector) lines.push('- **Selector:** `' + selector.replace(/`/g, '\\`') + '`');
      if (context) lines.push('- **Context:** ' + context);
      if (tagName && tagName !== 'group') lines.push('- **Tag:** `' + tagName + '`');

      // Include image paths
      if (ann.images && ann.images.length) {
        ann.images.forEach(function(img) {
          lines.push('- **Image:** `' + img.replace(/`/g, '\\`') + '`');
        });
      }

      // Include text to inject
      if (ann.texts && ann.texts.length) {
        ann.texts.forEach(function(txt) {
          lines.push('- **Inject:** ' + txt);
        });
      }

      lines.push('');
    });
  });

  // --- Footer ---
  lines.push('---');
  lines.push('');
  lines.push('_End of PageMark analysis. Apply annotations in order: MUST first, then SHOULD, then NIT. If a selector fails, use the note and context to find the target._');

  return lines.join('\n');
};

PromptGenerator.toClipboardHtml = function toClipboardHtml(markdown) {
  var html = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>');
  return '<div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:1rem">' + html + '</div>';
};
