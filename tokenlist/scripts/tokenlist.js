/*
 * tokenlist component for Knockout JS v1.0.5
 * (c) Jay Elaraj - http://nerdcave.com
 */

(function() {

  var Token = function(text, value, options) {
    this.text = text;
    this.value = value;
    options = options || {};
    this.isNew = !!options.isNew;
    this.isPreview = !!options.isPreview;
  }

  Token.prototype.displayText = function(substring) {
    if (this.isPreview) return this.text;
    var parts = this.text.split(substring);
    return parts.join("<span class='autocomplete-search'>" + substring + "</span>");
  }

  Token.prototype.toString = function() {
    return this.text;
  }


  var TokenListModel = function(params, container) {
    TokenListModel.KEYS = TokenListModel.KEYS || { up: 38, down: 40, enter: 13, tab: 9, backspace: 8, escape: 27, comma: 188 };
    var self = this;
    self.name = params.name || 'tokens'
    self.isAutocompleteVisible = ko.observable(false);
    self.autocompleteIndex = ko.observable(0);
    self.tokenInput = ko.observable('');
    self.isFocused = ko.observable(false);
    self.optionsText = params.textField;
    self.optionsValue = params.valueField;
    self.newValueFormat = params.newValueFormat;
    self.allowNew = params.allowNew == undefined ? true : params.allowNew;
    self.placeholder = params.placeholder || '';
    self.hideSelected = params.hideSelected == undefined ? false : params.hideSelected;

    if (params.tokens) {
      self.tokens = ko.observableArray(
        ko.utils.arrayMap(params.tokens(), function(paramToken) { return self.createTokenFromParam(paramToken); })
      );
      params.tokens.subscribe(function(changes) {
        for (var change of changes) {
          if (change.status === 'added') self.tokens.push(self.createTokenFromParam(change.value));
        }
      }, null, 'arrayChange');
    } else {
      self.tokens = ko.observableArray();
    }
    self.autocompleteEnabled = self.tokens().length > 0;

    self.selectedValues = params.selectedValues || ko.observableArray();
    self.selectedTokens = ko.pureComputed(function() {
      return ko.utils.arrayMap(self.selectedValues(), function(value) {
        return self.findTokenByValue(value)
      });
    });

    self.autocompleteTokens = ko.computed(function() {
      if (!self.autocompleteEnabled) return [];
      var text = self.tokenInput();
      var tokens = ko.utils.arrayFilter(self.tokens(), function(t) {
        return (!self.hideSelected || !self.isSelectedToken(t)) && t.text.indexOf(text) > -1;
      });
      var substringToken = ko.utils.arrayFirst(tokens, function(t) { return t.text === text; });
      if (text !== '' && !substringToken && self.allowNew) {
        tokens.unshift(new Token(text, self.makeNewValue(text), { isNew: true, isPreview: true }));
      }
      if (tokens.length > 0) {
        self.autocompleteIndex(tokens[0].isPreview && tokens.length > 1 ? 1 : 0);
      } else {
        self.hideAutocomplete();
      }
      return tokens;
    });

    self.isFocused.subscribe(function(focused) {
      if (focused === false) {
        self.hideAutocomplete();
        self.tokenInput('');
      }
    });

    self.inputSize = ko.pureComputed(function() {
      return Math.max(self.tokenInput() === '' ? self.inputPlaceholder().length : self.tokenInput().length, 1);
    });
    self.inputPlaceholder = ko.pureComputed(function() {
      return self.selectedValues().length === 0 ? self.placeholder : "";
    });
  }

  TokenListModel.prototype.createTokenFromParam = function(paramToken) {
    var text = paramToken[this.optionsText] || paramToken, value = paramToken[this.optionsValue] || paramToken;
    return new Token(text, value);
  }

  TokenListModel.prototype.findTokenByText = function(text) {
    return ko.utils.arrayFirst(this.tokens(), function(t) { return t.text === text });
  }

  TokenListModel.prototype.findTokenByValue = function(value) {
    return ko.utils.arrayFirst(this.tokens(), function(t) { return t.value === value });
  }

  TokenListModel.prototype.makeNewValue = function(value) {
    return this.newValueFormat ? this.newValueFormat.replace('%value%', value) : value;
  }

  TokenListModel.prototype.onKeyDown = function(data, event) {
    var allow = false, key = event.keyCode ? event.keyCode : event.which, KEYS = TokenListModel.KEYS;
    if (key === KEYS.escape || (key === KEYS.up && this.isAutocompleteVisible() && this.autocompleteIndex() === 0)) {
      this.hideAutocomplete();
    } else if (key === KEYS.down && !this.isAutocompleteVisible()) {
      this.showAutocomplete();
    } else if ((key === KEYS.up || key === KEYS.down) && this.isAutocompleteVisible()) {
      var newIndex = this.autocompleteIndex() + (key === KEYS.up ? -1: 1), total = this.autocompleteTokens().length;
      if (newIndex >= total) newIndex = 0;
      if (newIndex <= -1) newIndex = total - 1;
      this.autocompleteIndex(newIndex);
    } else if (key === KEYS.enter && this.isAutocompleteVisible()) {
      this.addSelectedAutocompleteToken();
    } else if (key === KEYS.tab || key === KEYS.enter || (key === KEYS.comma && !event.shiftKey)) {
      allow = !this.addFromInput() && key !== KEYS.enter && key !== KEYS.comma;
    } else if (key === KEYS.backspace && this.tokenInput() === '' && this.selectedValues().length > 0) {
      var token = this.findTokenByValue(this.selectedValues().slice(-1)[0]);
      if (this.unselectToken(token) && this.allowNew) this.tokenInput(token.text);
    } else {
      allow = true;
    }
    if (allow) this.showAutocomplete();
    return allow;
  }

  TokenListModel.prototype.addSelectedAutocompleteToken = function() {
    var token = this.autocompleteTokens()[this.autocompleteIndex()];
    if (token.isPreview && !this.allowNew) return;
    token.isPreview = false;
    this.selectToken(token);
    this.hideAutocomplete();
  }

  TokenListModel.prototype.addFromInput = function() {
    var text = this.tokenInput().replace(/^\s+|\s+$/gm, '');
    if (text === '') return false;
    var token = this.findTokenByText(text) || new Token(text, this.makeNewValue(text), { isNew: true });
    return this.selectToken(token);
  }

  TokenListModel.prototype.selectToken = function(token) {
    if (this.selectedValues().indexOf(token.value) > -1) return false;
    if (token.isNew && !this.allowNew) return false;

    if (token.isNew) this.tokens.push(token);
    this.selectedValues.push(token.value);
    this.tokenInput('');
    this.hideAutocomplete();
    this.isFocused(true);
    return true;
  }

  TokenListModel.prototype.isSelectedToken = function(token) {
    return this.selectedValues().indexOf(token.value) > -1;
  }

  TokenListModel.prototype.unselectToken = function(token) {
    this.selectedValues.remove(token.value);
    if (token.isNew) this.tokens.remove(token);
    this.hideAutocomplete();
    this.isFocused(true);
    return true;
  }

  TokenListModel.prototype.hideAutocomplete = function() {
    this.autocompleteIndex(0);
    this.isAutocompleteVisible(false);
  }

  TokenListModel.prototype.showAutocomplete = function() {
    if (!this.autocompleteEnabled) return;
    this.isAutocompleteVisible(this.autocompleteTokens().length > 0);
  }

  TokenListModel.prototype.onInputClick = function() {
    this.isFocused(true);
    this.showAutocomplete();
  }

  ko.components.register('tokenlist', {
    viewModel: TokenListModel,
    template: '\
      <div class="tokenlist-wrapper">\
        <select multiple data-bind="visible: false, attr: { name: name }, options: tokens, optionsText: \'text\', optionsValue:\'value\', selectedOptions: selectedValues"></select>\
        <input type="hidden" value="" data-bind="attr: { name: name }, enable: selectedValues().length === 0">\
        <ul class="token-list" data-bind="click: onInputClick">\
          <!-- ko foreach: selectedTokens -->\
          <li class="token">\
            <span data-bind="html: text"></span>\
            <a class="token-close" data-bind="click: $parent.unselectToken.bind($parent), clickBubble: false">&times;</a>\
          </li>\
          <!-- /ko -->\
          <li class="token-input">\
            <input type="text" tabindex="0" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"\
              data-bind="textInput: tokenInput, click: onInputClick, event: { keydown: onKeyDown }, hasFocus: isFocused, attr: { size: inputSize, placeholder: inputPlaceholder }">\
          </li>\
        </ul>\
        <ul class="autocomplete" data-bind="visible: isAutocompleteVisible, foreach: autocompleteTokens">\
          <li data-bind="css: { selected: $parent.isSelectedToken($data), highlight: $index() === $parent.autocompleteIndex(), \'new-token-preview\': isPreview },\
            html: displayText($parent.tokenInput()),\
            click: $parent.addSelectedAutocompleteToken.bind($parent),\
            event: { mousedown: $parent.isFocused.bind($parent, true), mouseover: $parent.autocompleteIndex.bind($parent, $index()) }">\
          </li>\
        </ul>\
      </div>\
    '
  });

})();
