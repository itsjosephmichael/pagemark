var Finder = Finder || {};

function getNthChild(elm) {
  var parent = elm.parentElement;
  if (!parent) return 1;
  var idx = 1;
  for (var i = 0; i < parent.children.length; i++) {
    if (parent.children[i] === elm) return idx;
    if (parent.children[i].tagName === elm.tagName) idx++;
  }
  return idx;
}

function uniqueAmongSiblings(elm, selector) {
  var parent = elm.parentElement;
  if (!parent) return true;
  for (var i = 0; i < parent.children.length; i++) {
    if (parent.children[i] !== elm) {
      try {
        if (parent.children[i].matches(selector)) return false;
      } catch (e) { return false; }
    }
  }
  return true;
}

Finder.generate = function generate(elm) {
  if (!elm || elm.nodeType !== 1) return '';
  if (elm.id) return '#' + CSS.escape(elm.id);

  var maxDepth = 3;
  var parts = [];

  var node = elm;
  for (var depth = 0; node && node.nodeType === 1 && depth <= maxDepth; depth++) {
    var tag = node.tagName.toLowerCase();
    var sel = tag;

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

    if (!uniqueAmongSiblings(node, sel)) {
      sel += ':nth-child(' + getNthChild(node) + ')';
    }

    parts.unshift(sel);
    node = node.parentElement;
  }

  var full = parts.join(' > ');
  if (full.length > 200) {
    full = full.slice(0, 197) + '...';
  }
  return full;
};

Finder.toXPath = function toXPath(elm) {
  if (!elm || elm.nodeType !== 1) return '';
  if (elm.id) return '//*[@id="' + elm.id.replace(/"/g, '&quot;') + '"]';

  var segs = [];
  var node = elm;
  while (node && node.nodeType === 1) {
    var idx = 1;
    var sibling = node.previousSibling;
    while (sibling) {
      if (sibling.nodeType === 1 && sibling.tagName === node.tagName) idx++;
      sibling = sibling.previousSibling;
    }
    segs.unshift(node.tagName.toLowerCase() + '[' + idx + ']');
    node = node.parentElement;
  }
  return '/' + segs.join('/');
};

Finder.findByXPath = function findByXPath(xpath, doc) {
  doc = doc || document;
  var result = [];
  var iter = doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
  var node;
  while ((node = iter.iterateNext())) result.push(node);
  return result;
};

Finder.findBySelector = function findBySelector(selector) {
  try {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  } catch (e) {
    return [];
  }
};
