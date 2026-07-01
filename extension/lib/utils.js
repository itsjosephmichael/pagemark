var utils = utils || {};

utils.LOCALHOST_PATTERNS = ['localhost', '127.0.0.1'];

utils.ACTIONS = ['add', 'modify', 'remove', 'replace', 'fix', 'consider', 'reference'];

utils.SEVERITIES = ['must', 'should', 'nit'];

utils.generateId = function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};

utils.debounce = function debounce(fn, ms) {
  var timer = null;
  return function () {
    var ctx = this, args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
  };
};

utils.throttle = function throttle(fn, ms) {
  var pending = false;
  return function () {
    if (pending) return;
    pending = true;
    var ctx = this, args = arguments;
    if (ms <= 16) {
      requestAnimationFrame(function () {
        pending = false;
        fn.apply(ctx, args);
      });
    } else {
      setTimeout(function () {
        pending = false;
        fn.apply(ctx, args);
      }, ms);
    }
  };
};

utils.getUniqueSelector = function getUniqueSelector(elm) {
  if (!elm || elm.nodeType !== 1) return '';
  var parts = [];
  var node = elm;
  while (node && node.nodeType === 1 && parts.length < 5) {
    var sel = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift('#' + CSS.escape(node.id));
      break;
    }
    if (node.className && typeof node.className === 'string') {
      var classes = node.className.trim().split(/\s+/).filter(function (c) {
        return c && !/^(flex|grid|mt-|mb-|ml-|mr-|pt-|pb-|pl-|pr-|px-|py-|mx-|my-|p-|m-|gap-|w-|h-|max-w-|min-h-|text-|bg-|border-|rounded-|shadow-|opacity-|z-|inset-|top-|bottom-|left-|right-|absolute|relative|fixed|sticky|block|inline-?block|inline|hidden|visible|overflow-|container|row|col|items-|justify-|self-|content-|flex-|order-)/.test(c);
      });
      if (classes.length) sel += '.' + classes.map(function (c) { return CSS.escape(c); }).join('.');
    }
    parts.unshift(sel);
    node = node.parentElement;
  }
  return parts.join(' > ');
};

utils.escapeCss = function escapeCss(str) {
  return CSS.escape(str);
};

utils.formatTimestamp = function formatTimestamp(ts) {
  var d = new Date(ts);
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  var hh = String(d.getHours()).padStart(2, '0');
  var min = String(d.getMinutes()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + min;
};

utils.truncate = function truncate(str, max) {
  if (!str || str.length <= max) return str || '';
  return str.slice(0, max) + '...';
};

utils.getWordAtOffset = function(textNode, offset) {
  var text = textNode.textContent || '';
  if (!text || offset < 0 || offset > text.length) return null;
  var start = offset;
  while (start > 0 && /\S/.test(text[start - 1]) && /[a-zA-Z0-9_\-\']/.test(text[start - 1])) start--;
  var end = offset;
  while (end < text.length && /\S/.test(text[end]) && /[a-zA-Z0-9_\-\']/.test(text[end])) end++;
  if (start === end) return null;
  return { word: text.substring(start, end), startOffset: start, endOffset: end };
};
