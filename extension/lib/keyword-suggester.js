var KeywordSuggester = KeywordSuggester || {};

KeywordSuggester.suggest = function suggest(note) {
  if (!note) return { action: null, severity: null };

  var lower = note.toLowerCase();
  var result = { action: null, severity: null };

  if (lower.indexOf('delete') !== -1 || lower.indexOf('remove') !== -1) {
    result.action = 'remove';
  }

  if (lower.indexOf('fix') !== -1 || lower.indexOf('broken') !== -1 || lower.indexOf('error') !== -1) {
    result.action = 'fix';
    result.severity = 'must';
  }

  if (lower.indexOf('add') !== -1 || lower.indexOf('need') !== -1 || lower.indexOf('missing') !== -1) {
    if (!result.action) result.action = 'add';
    if (!result.severity) result.severity = 'should';
  }

  if (lower.indexOf('change') !== -1 || lower.indexOf('update') !== -1 || lower.indexOf('modify') !== -1) {
    if (!result.action) result.action = 'modify';
  }

  if (lower.indexOf('replace') !== -1 || lower.indexOf('swap') !== -1) {
    if (!result.action) result.action = 'replace';
  }

  if (lower.indexOf('maybe') !== -1 || lower.indexOf('consider') !== -1 || lower.indexOf('should we') !== -1) {
    if (!result.action) result.action = 'consider';
    if (!result.severity) result.severity = 'nit';
  }

  if (lower.indexOf('critical') !== -1 || lower.indexOf('blocking') !== -1) {
    result.severity = 'must';
  }

  if (lower.indexOf('polish') !== -1 || lower.indexOf('minor') !== -1 || lower.indexOf('nit') !== -1) {
    result.severity = 'nit';
  }

  return result;
};
