/* 
 * tokenlist v1.2.4 for Knockout JS
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
    if (this.isPreview || !substring) return this.text;
    var parts = this.text.split(substring);
    return parts.join("<mark class='autocomplete-search'>" + substring + "</mark>");
  }

  Token.prototype.toString = function() {
    return this.text;
  }


  var TokenListModel = function(params, container) {
    TokenListModel.KEYS = TokenListModel.KEYS || { up: 38, down: 40, enter: 13, tab: 9, backspace: 8, escape: 27, comma: 188 };
    var self = this;
    self.formFieldName = params.name || 'tokens';
    self.optionsText = params.textField;
    self.optionsValue = params.valueField;
    self.newValueFormat = params.newValueFormat;
    self.isSingle = ko.observable(params.isSingle === undefined ? false : params.isSingle);
    self.allowNew = (params.allowNew === undefined ? true : params.allowNew) && !self.isSingle();
    self.placeholder = params.placeholder || '';
    self.hideSelected = params.hideSelected === undefined ? false : params.hideSelected;
    self.useStringInput  = params.useStringInput === undefined ? false : params.useStringInput;
    self.hasAutocomplete = params.hasAutocomplete === undefined ? true : params.hasAutocomplete;
    self.stringInputSeparator = params.stringInputSeparator || ',';
    self.noResultsText = params.noResultsText || 'No results found';
    self.allowClear = params.allowClear === undefined ? false : params.allowClear;
    self.singleValue = params.value || ko.observable();
    if (!ko.isObservable(self.singleValue)) throw Error("value param must be an observable.");

    self.isAutocompleteVisible = ko.observable(false);
    self.isAutocompleteBelow = ko.observable(true);
    self.autocompleteIndex = ko.observable(0);
    self.tokenInput = ko.observable('');
    self.isFocused = ko.observable(false);

    if (self.isSingle() && params.selectedValues) throw Error("Use value param instead of selectedValues when using isSingle.");
    self.selectedValues = params.selectedValues || ko.observableArray();
    if (!ko.isObservable(self.selectedValues)) throw Error("selectedValues param must be an observableArray.");
    self.selectedTokens = ko.pureComputed(function() {
      return ko.utils.arrayMap(self.selectedValues(), function(value) {
        return self.findToken('value', value)
      });
    });

    if (params.tokens) {
      if (!ko.isObservable(params.tokens)) throw Error("tokens param must be an observableArray.");
      var tokens = ko.utils.arrayMap(params.tokens(), function(paramToken) { return self.createTokenFromParam(paramToken); });
      self.tokens = ko.observableArray(tokens);
      params.tokens.subscribe(function(changes) {
        for (var change of changes) {
          if (change.status === 'added') self.tokens.push(self.createTokenFromParam(change.value));
        }
      }, null, 'arrayChange');
    } else {
      var tokens = ko.utils.arrayMap(self.selectedValues(), function(val) { return new Token(val, val); });
      self.tokens = ko.observableArray(tokens);
      self.hasAutocomplete = false;
    }

    if (self.isSingle()) {
      if (self.singleValue()) {
        self.selectedValues([self.singleValue()]);
        self.singleValue.subscribe(function(val) {
          // in case value observable is set outside component
          if (val !== self.selectedValues()[0]) self.selectedValues([val]);
        });
      } else if (!self.placeholder) {
        self.selectToken(self.tokens()[0]);
      }
    }

    // pureComputed doesn't work
    // test case: type token that doesn't exist; won't be selected immediately in autocomplete
    self.autocompleteTokens = ko.computed(function() {
      if (!self.hasAutocomplete) return [];
      var text = self.tokenInput();
      var tokens = ko.utils.arrayFilter(self.tokens(), function(t) {
        return (!self.hideSelected || !self.isSelectedToken(t)) && t.text.indexOf(text) > -1;
      });
      var substringToken = ko.utils.arrayFirst(tokens, function(t) { return t.text === text; });
      if (text !== '' && !substringToken && self.allowNew) {
        tokens.unshift(new Token(text, self.makeNewValue(text), { isNew: true, isPreview: true }));
      }
      return tokens;
    });

    self.isFocused.subscribe(function(focused) {
      if (focused === false) {
        self.tokenInput('');
        self.hideAutocomplete();
      }
    });

    self.inputSize = ko.pureComputed(function() {
      return Math.max(self.tokenInput() === '' ? self.inputPlaceholder().length : self.tokenInput().length, 1) + 1;
    });

    self.inputPlaceholder = ko.pureComputed(function() {
      return self.selectedValues().length === 0 ? self.placeholder : "";
    });

    self.stringInputValue = ko.pureComputed(function() {
      return self.useStringInput ? self.selectedValues().join(self.stringInputSeparator) : "";
    });

    self.singleText = ko.pureComputed(function() {
      var valueToken = self.selectedTokens()[0];
      return valueToken ? valueToken.text : self.placeholder;
    });

    self.tokenInput.subscribe(function() {
      self.showAutocomplete();
    });

    self.isNoResultsVisible = ko.pureComputed(function() {
      return !self.allowNew && self.autocompleteTokens().length === 0;
    });
  }

  TokenListModel.prototype.createTokenFromParam = function(paramToken) {
    var text = paramToken[this.optionsText] || paramToken, value = paramToken[this.optionsValue] || paramToken;
    return new Token(text, value);
  }

  TokenListModel.prototype.findToken = function(field, val) {
    return ko.utils.arrayFirst(this.tokens(), function(t) { return t[field] === val });
  }

  TokenListModel.prototype.makeNewValue = function(value) {
    return this.newValueFormat ? this.newValueFormat.replace('%value%', value) : value;
  }

  TokenListModel.prototype.onKeyDown = function(data, event) {
    var allow = false, key = event.keyCode ? event.keyCode : event.which, KEYS = TokenListModel.KEYS;
    if (key === KEYS.escape) {
      this.hideAutocomplete();
    } else if (key === KEYS.down && !this.isAutocompleteVisible()) {
      this.showAutocomplete();
    } else if ((key === KEYS.up || key === KEYS.down) && this.isAutocompleteVisible()) {
      var index = this.autocompleteIndex() + (key === KEYS.up ? -1: 1), total = this.autocompleteTokens().length;
      this.autocompleteIndex(index >= total ? 0 : index <= -1 ? total - 1 : index);
    } else if (key === KEYS.enter && this.isAutocompleteVisible()) {
      this.addSelectedAutocompleteToken();
    } else if (key === KEYS.tab || key === KEYS.enter || (key === KEYS.comma && !event.shiftKey)) {
      allow = !this.addFromInput() && key !== KEYS.enter && key !== KEYS.comma;
    } else if (!this.isSingle() && key === KEYS.backspace && this.tokenInput() === '' && this.selectedValues().length > 0) {
      var token = this.findToken('value', this.selectedValues().slice(-1)[0]);
      if (this.unselectToken(token) && this.allowNew) this.tokenInput(token.text);
    } else {
      allow = true;
    }
    return allow;
  }

  TokenListModel.prototype.addSelectedAutocompleteToken = function() {
    var token = this.autocompleteTokens()[this.autocompleteIndex()];
    if (!token || (token.isPreview && !this.allowNew)) return false;
    token.isPreview = false;
    this.selectToken(token);
    this.hideAutocomplete();
    return true;
  }

  TokenListModel.prototype.addFromInput = function() {
    var text = this.tokenInput().replace(/^\s+|\s+$/gm, '');
    if (text === '') return false;
    var token = this.findToken('text', text) || new Token(text, this.makeNewValue(text), { isNew: true });
    return this.selectToken(token);
  }

  TokenListModel.prototype.isSelectedToken = function(token) {
    return this.selectedValues().indexOf(token.value) > -1;
  }

  TokenListModel.prototype.selectToken = function(token) {
    if (this.selectedValues().indexOf(token.value) > -1) return false;
    if (token.isNew && !this.allowNew) return false;

    if (token.isNew) this.tokens.push(token);
    this.selectedValues.push(token.value);
    if (this.isSingle()) {
      if (this.selectedValues().length === 2) this.unselectToken(this.selectedTokens()[0]);
      this.singleValue(token.value);
    }
    this.tokenInput('');
    this.isFocused(true);
    return true;
  }

  TokenListModel.prototype.unselectToken = function(token) {
    if (!token) return false;
    this.selectedValues.remove(token.value);
    if (token.isNew) this.tokens.remove(token);
    this.isFocused(true);
    return true;
  }

  TokenListModel.prototype.hideAutocomplete = function() {
    if (this.isSingle()) this.isFocused(false);
    this.isAutocompleteVisible(false);
  }

  TokenListModel.prototype.showAutocomplete = function() {
    if (!this.hasAutocomplete) return;

    var tokens = this.autocompleteTokens();
    if (tokens.length > 0) {
      var index = 0, self = this;
      if (tokens[0].isPreview && tokens.length > 1) {
        var token = ko.utils.arrayFirst(tokens, function(t) { return !t.isPreview && !self.isSelectedToken(t); });
        if (token) index = tokens.indexOf(token);
      }
      this.autocompleteIndex(index);
    }
    this.isAutocompleteVisible(tokens.length > 0 || this.isNoResultsVisible());
  }

  TokenListModel.prototype.toggleAutocomplete = function() {
    if (this.isAutocompleteVisible()) {
      this.hideAutocomplete()
    } else {
      this.showAutocomplete();
      this.isFocused(true);
    }
  }

  TokenListModel.prototype.isSingleClearVisible = function() {
    return this.allowClear && this.selectedTokens()[0] && this.placeholder;
  }

  TokenListModel.prototype.isStringInputEnabled = function() {
    return this.useStringInput || this.selectedValues().length === 0;
  }

  TokenListModel.prototype.clearSingleValue = function() {
    this.selectedValues.remove((this.selectedTokens()[0] || {}).value);
  }


  ko.bindingHandlers.scrollIntoView = {
    update: function(li, valueAccessor) {
      if (ko.unwrap(valueAccessor()) === false) return;
      var liRect = li.getBoundingClientRect(), liBottom = li.offsetTop + liRect.height;
      var ul = li.parentNode, ulRect = ul.getBoundingClientRect();
      var totalHeight = ulRect.height + ul.scrollTop;
      if (li.offsetTop < ul.scrollTop) {
        ul.scrollTop = li.offsetTop;
      } else if (liBottom > totalHeight) {
        ul.scrollTop += liBottom - totalHeight;
      }
    }
  }

  ko.bindingHandlers.resetScrollTop = {
    update: function(ul, valueAccessor) {
      if (ko.unwrap(valueAccessor()) === true) ul.scrollTop = 0;
    }
  }

  ko.bindingHandlers.setTopPosition = {
    update: function(el, valueAccessor, allBindings, viewModel, bindingContext) {
      if (ko.unwrap(valueAccessor()) === false) {
        el.style.bottom = null;
      } else {
        var rect = el.getBoundingClientRect(), wrapper = el.parentNode, vm = bindingContext.$rawData;
        if (rect.top + rect.height < window.innerHeight) {
          vm.isAutocompleteBelow(true);
        } else {
          var styles = getComputedStyle(wrapper);
          var borderWidths = parseFloat(styles.getPropertyValue('border-top-width')) + parseFloat(styles.getPropertyValue('border-bottom-width'));
          el.style.bottom = wrapper.getBoundingClientRect().height - borderWidths + 'px';
          vm.isAutocompleteBelow(false);
        }
      }
    }
  }

  ko.components.register('tokenlist', {
    viewModel: TokenListModel,
    template: '\
      <div class="tokenlist-wrapper" data-bind="event: { mousedown: toggleAutocomplete }">\
        <select multiple data-bind="enable: !isStringInputEnabled(), visible: false, attr: { name: formFieldName }, options: tokens, optionsText: \'text\', optionsValue:\'value\', selectedOptions: selectedValues"></select>\
        <input type="hidden" data-bind="enable: isStringInputEnabled(), attr: { name: formFieldName }, value: stringInputValue">\
      <!-- ko if: isSingle() -->\
        <span class="single-text" data-bind="text: singleText, css: { placeholder: !selectedTokens()[0] }"></span>\
        <span class="single-clear" data-bind="visible: isSingleClearVisible(), click: clearSingleValue, event: { mousedown: function(){} }, mousedownBubble: false">&times;</span>\
        <span class="single-arrow" data-bind="css: { \'arrow-up\': isAutocompleteVisible(), \'arrow-down\': !isAutocompleteVisible() }"></span>\
      <!-- /ko -->\
      <!-- ko ifnot: isSingle() -->\
        <ul class="token-list">\
        <!-- ko foreach: selectedTokens -->\
          <li class="token">\
            <span data-bind="html: text"></span>\
            <a class="token-close" data-bind="click: $parent.unselectToken.bind($parent), event: { mousedown: function(){} }, mousedownBubble: false">&times;</a>\
          </li>\
        <!-- /ko -->\
          <li class="token-input">\
            <input type="text" tabindex="0" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"\
                   data-bind="textInput: tokenInput, event: { keydown: onKeyDown }, hasFocus: isFocused, attr: { size: inputSize, placeholder: inputPlaceholder }">\
          </li>\
        </ul>\
      <!-- /ko -->\
        <div class="autocomplete-wrapper" data-bind="visible: isAutocompleteVisible, setTopPosition: isAutocompleteVisible, css: { \'autocomplete-below\': isAutocompleteBelow(), \'autocomplete-above\': !isAutocompleteBelow() }">\
        <!-- ko if: isSingle() -->\
          <span class="single-input-wrapper">\
            <input type="text" tabindex="0" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"\
                   data-bind="textInput: tokenInput, event: { keydown: onKeyDown, mousedown: function(){} }, mousedownBubble: false, hasFocus: isFocused">\
          </span>\
        <!-- /ko -->\
          <span class="no-results-message" data-bind="visible: isNoResultsVisible, text: noResultsText"></span>\
          <ul class="autocomplete" data-bind="foreach: autocompleteTokens, resetScrollTop: isAutocompleteVisible">\
            <li data-bind="css: { selected: $parent.isSelectedToken($data), highlight: $index() === $parent.autocompleteIndex(), \'new-token-preview\': isPreview },\
              html: displayText($parent.tokenInput()),\
              event: { mouseup: $parent.addSelectedAutocompleteToken.bind($parent), mouseover: $parent.autocompleteIndex.bind($parent, $index()), mousedown: function(){} }, mousedownBubble: false,\
              scrollIntoView: $index() === $parent.autocompleteIndex()">\
            </li>\
          </ul>\
        </div>\
      </div>\
    '
  });

})();
