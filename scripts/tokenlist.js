// tokenlist component for Knockout JS
// Jay Elaraj, 2015

(function() {

  var Token = function(name, isAutocomplete, visibleInAutocomplete) {
    this.name = name;
    this.isAutocomplete = !!isAutocomplete;
    this.visibleInAutocomplete = ko.observable(!!visibleInAutocomplete);
  }

  Token.prototype.displayName = function(substring) {
    var parts = this.name.split(substring);
    return parts.join("<span class='autocomplete-search'>" + substring + "</span>")
  }

  Token.prototype.toString = function() {
    return this.name;
  }


  var TokenListModel = function(params, container) {
    TokenListModel.KEYS = TokenListModel.KEYS || { up: 38, down: 40, enter: 13, tab: 9, backspace: 8, escape: 27, comma: 188 };

    var self = this;
    self.$container = $(container);
    self.$formElement = $(params.formElement);
    self.autocompletePosition = { top: ko.observable(0), left: ko.observable(0) };
    self.isFocused = ko.observable(true);
    self.isAutocompleteVisible = ko.observable(false);
    self.autocompleteIndex = ko.observable(0);
    self.tokenFromInput = ko.observable('');
    self.autocompleteTokens = ko.observableArray(
      $.map(params.autocompleteTokens, function(tokenName) {
        return new Token($.trim(tokenName), true, true);
      })
    );
    self.tokens = ko.observableArray(
      $.map(self.$formElement.val().split(','), function(tokenName) {
        tokenName = $.trim(tokenName);
        var autocompleteToken = self.findAutocompleteToken(tokenName);
        if (autocompleteToken) {
          autocompleteToken.visibleInAutocomplete(false);
          return autocompleteToken;
        } else {
          return new Token(tokenName);
        }
      })
    );

    // not pureComputed (since checking token.name isn't pure)
    self.autocompleteTokensActive = ko.computed(function() {
      var tokenName = self.tokenFromInput();
      return $.grep(self.autocompleteTokens(), function(token) {
        return token.visibleInAutocomplete() && token.name.indexOf(tokenName) > -1;
      });
    });

    self.tokenFromInput.subscribe(function(val) {
      if (val !== '') self.showAutocomplete();
    });

    self.isFocused.subscribe(function(focused) {
      if (focused === false) {
        self.hideAutocomplete();
        self.addTokenFromInput();
      }
    });

    self.tokens.subscribe(function() {
      self.$formElement.val(self.tokens().join(','));
    })

  }

  TokenListModel.prototype.findAutocompleteToken = function(tokenName) {
    return $.grep(this.autocompleteTokens(), function(t) { return t.name === tokenName; })[0];
  }

  TokenListModel.prototype.addToken = function(token) {
    if (token.name === '') return false;
    var exists = $.grep(this.tokens(), function(t) { return t.name === token.name; }).length > 0;
    if (exists) return false
    this.tokens.push(token);
    this.tokenFromInput('');
    if (token.isAutocomplete) {
      token.visibleInAutocomplete(false);
      this.hideAutocomplete();
      this.isFocused(true);
    }
    return true;
  }

  TokenListModel.prototype.removeTokenByIndex = function(index) {
    token = this.tokens.splice(index, 1)[0];
    if (token.isAutocomplete) token.visibleInAutocomplete(true);
    this.hideAutocomplete();
    this.isFocused(true);
  }

  TokenListModel.prototype.addTokenFromInput = function() {
    var tokenName = this.tokenFromInput();
    var autocompleteToken = this.findAutocompleteToken(tokenName);
    if (this.addToken(autocompleteToken || new Token(tokenName))) {
      this.tokenFromInput('');
      this.isFocused(true);
      this.hideAutocomplete();
    }
  }

  TokenListModel.prototype.hideAutocomplete = function() {
    this.isAutocompleteVisible(false);
  }

  TokenListModel.prototype.showAutocomplete = function() {
    if (this.autocompleteTokensActive().length === 0) {
      this.hideAutocomplete();
    } else {
      this.autocompleteIndex(0);
      // better way to do this?
      var inputPosition = this.$container.find('li.token-input input').position();
      this.autocompletePosition.top(inputPosition.top + 5);
      this.autocompletePosition.left(inputPosition.left);
      this.isAutocompleteVisible(true);
    }
  }

  TokenListModel.prototype.onKeyDown = function(data, event) {
    var allow = false, key = event.keyCode ? event.keyCode : event.which, KEYS = TokenListModel.KEYS;
    if (key === KEYS.escape || (key === KEYS.up && this.isAutocompleteVisible() && this.autocompleteIndex() === 0)) {
      this.hideAutocomplete();
    } else if (key === KEYS.down && !this.isAutocompleteVisible()) {
      this.showAutocomplete();
    } else if ((key === KEYS.up || key === KEYS.down) && this.isAutocompleteVisible()) {
      var newIndex = this.autocompleteIndex() + (key === KEYS.up ? -1: 1);
      var visibleTokensCount = this.autocompleteTokensActive().length;
      if (newIndex >= visibleTokensCount) newIndex = 0;
      if (newIndex <= -1) newIndex = visibleTokensCount - 1;
      this.autocompleteIndex(newIndex);
    } else if (key === KEYS.enter && this.isAutocompleteVisible()) {
      var selectedToken = this.autocompleteTokensActive()[this.autocompleteIndex()];
      this.addToken(selectedToken);
    } else if (key === KEYS.tab || key === KEYS.enter || (key === KEYS.comma && !event.shiftKey)) {
      this.addTokenFromInput();
    } else if (key === KEYS.backspace && this.tokenFromInput() === '') {
      this.removeTokenByIndex(this.tokens().length - 1);
    } else {
      allow = true;
    }
    return allow;
  }

  ko.components.register('tokenlist', {
    template: '\
      <div class="token-wrapper">\
        <ul class="token-list clearfix">\
          <!-- ko foreach: tokens -->\
          <li class="token">\
            <span data-bind="html: name"></span>\
            <a class="token-close" data-bind="click: $parent.removeTokenByIndex.bind($parent, $index())">&times;</a>\
          </li>\
          <!-- /ko -->\
          <li class="token-input">\
            <input type="text" data-bind="value: tokenFromInput, valueUpdate: \'input\', event: { keydown: onKeyDown }, hasFocus: isFocused">\
          </li>\
        </ul>\
        <ul class="autocomplete" data-bind="visible: isAutocompleteVisible, style: { top: autocompletePosition.top() + \'px\', left: autocompletePosition.left() + \'px\' }, foreach: autocompleteTokensActive">\
          <li data-bind="css: { selected: $index() === $parent.autocompleteIndex() }, html: displayName($parent.tokenFromInput()), click: $parent.addToken.bind($parent), event: { mousedown: $parent.isFocused.bind($parent, true), mouseover: $parent.autocompleteIndex.bind($parent, $index()) }"></li>\
        </ul>\
      </div>\
    ',
    viewModel: {
      createViewModel: function(params, componentInfo) {
        return new TokenListModel(params, componentInfo.element);
      }
    }
  });

})();