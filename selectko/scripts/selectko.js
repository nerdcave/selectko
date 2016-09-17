/* 
 * selectko v1.2.4 for Knockout JS
 * (c) Jay Elaraj - http://nerdcave.com
 */

(function() {

  var OptionItem = function(text, value, options) {
    this.text = text;
    this.value = value;
    options = options || {};
    this.isNew = !!options.isNew;
    this.isPreview = !!options.isPreview;
  }

  OptionItem.prototype.displayText = function(substring) {
    if (this.isPreview || !substring) return this.text;
    var parts = this.text.split(substring);
    return parts.join("<mark class='autocomplete-search'>" + substring + "</mark>");
  }

  OptionItem.prototype.toString = function() {
    return this.text;
  }


  var SelectkoModel = function(params, container) {
    SelectkoModel.KEYS = SelectkoModel.KEYS || { up: 38, down: 40, enter: 13, tab: 9, backspace: 8, escape: 27, comma: 188 };
    var self = this;
    self.formFieldName = params.name || 'items';
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
    self.optionInput = ko.observable('');
    self.isFocused = ko.observable(false);

    if (self.isSingle() && params.selectedValues) throw Error("Use value param instead of selectedValues when using isSingle.");
    self.selectedValues = params.selectedValues || ko.observableArray();
    if (!ko.isObservable(self.selectedValues)) throw Error("selectedValues param must be an observableArray.");
    self.selectedOptions = ko.pureComputed(function() {
      return ko.utils.arrayMap(self.selectedValues(), function(value) {
        return self.findOption('value', value)
      });
    });

    if (params.options) {
      if (!ko.isObservable(params.options)) throw Error("options param must be an observableArray.");
      var options = ko.utils.arrayMap(params.options(), function(paramOption) { return self.createOptionFromParam(paramOption); });
      self.options = ko.observableArray(options);
      params.options.subscribe(function(changes) {
        ko.utils.arrayForEach(changes, function(change) {
          if (change.status === 'added') self.options.push(self.createOptionFromParam(change.value));
        });
      }, null, 'arrayChange');
    } else {
      var options = ko.utils.arrayMap(self.selectedValues(), function(val) { return new OptionItem(val, val); });
      self.options = ko.observableArray(options);
      self.hasAutocomplete = false;
    }

    if (self.isSingle()) {
      if (self.singleValue()) {
        self.selectedValues([self.singleValue()]);
        self.singleValue.subscribe(function(val) {
          // in case value observable is set outside component
          if (val && val !== self.selectedValues()[0]) self.selectedValues([val]);
        });
      } else if (!self.placeholder) {
        self.selectOption(self.options()[0]);
      }
    }

    // pureComputed doesn't work
    // test case: type option that doesn't exist; won't be selected immediately in autocomplete
    self.autocompleteOptions = ko.computed(function() {
      if (!self.hasAutocomplete) return [];
      var text = self.optionInput();
      var options = ko.utils.arrayFilter(self.options(), function(t) {
        return (!self.hideSelected || !self.isSelectedOption(t)) && t.text.indexOf(text) > -1;
      });
      var substringOption = ko.utils.arrayFirst(options, function(t) { return t.text === text; });
      if (text !== '' && !substringOption && self.allowNew) {
        options.unshift(new OptionItem(text, self.makeNewValue(text), { isNew: true, isPreview: true }));
      }
      return options;
    });

    self.isFocused.subscribe(function(focused) {
      if (focused === false) {
        self.optionInput('');
        self.hideAutocomplete();
      }
    });

    self.inputSize = ko.pureComputed(function() {
      return Math.max(self.optionInput() === '' ? self.inputPlaceholder().length : self.optionInput().length, 1) + 1;
    });

    self.inputPlaceholder = ko.pureComputed(function() {
      return self.selectedValues().length === 0 ? self.placeholder : "";
    });

    self.stringInputValue = ko.pureComputed(function() {
      return self.useStringInput ? self.selectedValues().join(self.stringInputSeparator) : "";
    });

    self.singleText = ko.pureComputed(function() {
      var valueOption = self.selectedOptions()[0];
      return valueOption ? valueOption.text : self.placeholder;
    });

    self.optionInput.subscribe(function() {
      self.showAutocomplete();
    });

    self.isNoResultsVisible = ko.pureComputed(function() {
      return !self.allowNew && self.autocompleteOptions().length === 0;
    });
  }

  SelectkoModel.prototype.createOptionFromParam = function(paramOption) {
    var text = paramOption[this.optionsText] || paramOption, value = paramOption[this.optionsValue] || paramOption;
    return new OptionItem(text, value);
  }

  SelectkoModel.prototype.findOption = function(field, val) {
    return ko.utils.arrayFirst(this.options(), function(t) { return t[field] === val });
  }

  SelectkoModel.prototype.makeNewValue = function(value) {
    return this.newValueFormat ? this.newValueFormat.replace('%value%', value) : value;
  }

  SelectkoModel.prototype.onKeyDown = function(data, event) {
    var allow = false, key = event.keyCode ? event.keyCode : event.which, KEYS = SelectkoModel.KEYS;
    if (key === KEYS.escape) {
      this.hideAutocomplete();
    } else if (key === KEYS.down && !this.isAutocompleteVisible()) {
      this.showAutocomplete();
    } else if ((key === KEYS.up || key === KEYS.down) && this.isAutocompleteVisible()) {
      var index = this.autocompleteIndex() + (key === KEYS.up ? -1: 1), total = this.autocompleteOptions().length;
      this.autocompleteIndex(index >= total ? 0 : index <= -1 ? total - 1 : index);
    } else if (key === KEYS.enter && this.isAutocompleteVisible()) {
      this.addSelectedAutocompleteOption();
    } else if (key === KEYS.tab || key === KEYS.enter || (key === KEYS.comma && !event.shiftKey)) {
      allow = !this.addFromInput() && key !== KEYS.enter && key !== KEYS.comma;
    } else if (!this.isSingle() && key === KEYS.backspace && this.optionInput() === '' && this.selectedValues().length > 0) {
      var option = this.findOption('value', this.selectedValues().slice(-1)[0]);
      if (this.unselectOption(option) && this.allowNew) this.optionInput(option.text);
    } else {
      allow = true;
    }
    return allow;
  }

  SelectkoModel.prototype.addSelectedAutocompleteOption = function() {
    var option = this.autocompleteOptions()[this.autocompleteIndex()];
    if (!option || (option.isPreview && !this.allowNew)) return false;
    option.isPreview = false;
    this.selectOption(option);
    this.hideAutocomplete();
    return true;
  }

  SelectkoModel.prototype.addFromInput = function() {
    var text = this.optionInput().replace(/^\s+|\s+$/gm, '');
    if (text === '') return false;
    var option = this.findOption('text', text) || new OptionItem(text, this.makeNewValue(text), { isNew: true });
    return this.selectOption(option);
  }

  SelectkoModel.prototype.isSelectedOption = function(option) {
    return this.selectedValues().indexOf(option.value) > -1;
  }

  SelectkoModel.prototype.selectOption = function(option) {
    if (this.selectedValues().indexOf(option.value) > -1) return false;
    if (option.isNew && !this.allowNew) return false;

    if (option.isNew) this.options.push(option);
    this.selectedValues.push(option.value);
    if (this.isSingle()) {
      if (this.selectedValues().length === 2) this.unselectOption(this.selectedOptions()[0]);
      this.singleValue(option.value);
    }
    this.optionInput('');
    this.isFocused(true);
    return true;
  }

  SelectkoModel.prototype.unselectOption = function(option) {
    if (!option) return false;
    this.selectedValues.remove(option.value);
    if (option.isNew) this.options.remove(option);
    this.isFocused(true);
    return true;
  }

  SelectkoModel.prototype.hideAutocomplete = function() {
    if (this.isSingle()) this.isFocused(false);
    this.isAutocompleteVisible(false);
  }

  SelectkoModel.prototype.showAutocomplete = function() {
    if (!this.hasAutocomplete) return;

    var options = this.autocompleteOptions();
    if (options.length > 0) {
      var index = 0, self = this;
      if (options[0].isPreview && options.length > 1) {
        var option = ko.utils.arrayFirst(options, function(t) { return !t.isPreview && !self.isSelectedOption(t); });
        if (option) index = options.indexOf(option);
      }
      this.autocompleteIndex(index);
    }
    this.isAutocompleteVisible(options.length > 0 || this.isNoResultsVisible());
  }

  SelectkoModel.prototype.toggleAutocomplete = function() {
    if (this.isAutocompleteVisible()) {
      this.hideAutocomplete()
    } else {
      this.showAutocomplete();
      this.isFocused(true);
    }
  }

  SelectkoModel.prototype.isSingleClearVisible = function() {
    return this.allowClear && this.selectedOptions()[0] && this.placeholder;
  }

  SelectkoModel.prototype.isStringInputEnabled = function() {
    return this.useStringInput || this.selectedValues().length === 0;
  }

  SelectkoModel.prototype.clearSingleValue = function() {
    this.selectedValues.remove((this.selectedOptions()[0] || {}).value);
    this.singleValue(null);
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

  ko.components.register('selectko', {
    viewModel: SelectkoModel,
    template: '\
      <div class="selectko-wrapper" data-bind="event: { mousedown: toggleAutocomplete }">\
        <select multiple data-bind="enable: !isStringInputEnabled(), visible: false, attr: { name: formFieldName }, options: options, optionsText: \'text\', optionsValue:\'value\', selectedOptions: selectedValues"></select>\
        <input type="hidden" data-bind="enable: isStringInputEnabled(), attr: { name: formFieldName }, value: stringInputValue">\
      <!-- ko if: isSingle() -->\
        <span class="single-text" data-bind="text: singleText, css: { placeholder: !selectedOptions()[0] }"></span>\
        <span class="single-clear" data-bind="visible: isSingleClearVisible(), click: clearSingleValue, event: { mousedown: function(){} }, mousedownBubble: false">&times;</span>\
        <span class="single-arrow" data-bind="css: { \'arrow-up\': isAutocompleteVisible(), \'arrow-down\': !isAutocompleteVisible() }"></span>\
      <!-- /ko -->\
      <!-- ko ifnot: isSingle() -->\
        <ul class="option-list">\
        <!-- ko foreach: selectedOptions -->\
          <li class="option">\
            <span data-bind="html: text"></span>\
            <a class="option-close" data-bind="click: $parent.unselectOption.bind($parent), event: { mousedown: function(){} }, mousedownBubble: false">&times;</a>\
          </li>\
        <!-- /ko -->\
          <li class="option-input">\
            <input type="text" tabindex="0" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"\
                   data-bind="textInput: optionInput, event: { keydown: onKeyDown }, hasFocus: isFocused, attr: { size: inputSize, placeholder: inputPlaceholder }">\
          </li>\
        </ul>\
      <!-- /ko -->\
        <div class="autocomplete-wrapper" data-bind="visible: isAutocompleteVisible, setTopPosition: isAutocompleteVisible, css: { \'autocomplete-below\': isAutocompleteBelow(), \'autocomplete-above\': !isAutocompleteBelow() }">\
        <!-- ko if: isSingle() -->\
          <span class="single-input-wrapper">\
            <input type="text" tabindex="0" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"\
                   data-bind="textInput: optionInput, event: { keydown: onKeyDown, mousedown: function(){} }, mousedownBubble: false, hasFocus: isFocused">\
          </span>\
        <!-- /ko -->\
          <span class="no-results-message" data-bind="visible: isNoResultsVisible, text: noResultsText"></span>\
          <ul class="autocomplete" data-bind="foreach: autocompleteOptions, resetScrollTop: isAutocompleteVisible">\
            <li data-bind="css: { selected: $parent.isSelectedOption($data), highlight: $index() === $parent.autocompleteIndex(), \'new-option-preview\': isPreview },\
              html: displayText($parent.optionInput()),\
              event: { mouseup: $parent.addSelectedAutocompleteOption.bind($parent), mouseover: $parent.autocompleteIndex.bind($parent, $index()), mousedown: function(){} }, mousedownBubble: false,\
              scrollIntoView: $index() === $parent.autocompleteIndex()">\
            </li>\
          </ul>\
        </div>\
      </div>\
    '
  });

})();
