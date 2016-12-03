/* 
 * selectko v1.3.1 for Knockout JS
 * (c) Jay Elaraj - http://nerdcave.com
 */

(function() {

  var SelectkoModel = function(params, container) {
    var vm = this, defaultBool = function(param, defaultVal) { return param === undefined ? defaultVal : param }
    vm.formFieldName = params.name || 'items';
    vm.optionsText = params.textField;
    vm.optionsValue = params.valueField;
    vm.newValueFormat = params.newValueFormat;
    vm.isMultiple = defaultBool(params.isMultiple, false);
    vm.allowNew = defaultBool(params.allowNew, true) && vm.isMultiple;
    vm.placeholder = params.placeholder || '';
    vm.hideSelected = defaultBool(params.hideSelected, false);
    vm.useStringInput  = defaultBool(params.useStringInput, false);
    vm.hasAutocomplete = defaultBool(params.hasAutocomplete, true) && params.options;
    vm.stringInputSeparator = params.stringInputSeparator || ',';
    vm.noResultsText = params.noResultsText || 'No results found';
    vm.allowClear = defaultBool(params.allowClear, false);

    vm.isAutocompleteVisible = ko.observable(false);
    vm.isAutocompleteBelow = ko.observable(true);
    vm.autocompleteIndex = ko.observable(0);
    vm.optionInput = ko.observable('');
    vm.isFocused = ko.observable(false);

    var selectedValues = [].concat(ko.unwrap(params.selected) || []);
    var options = ko.utils.arrayMap(ko.unwrap(params.options) || selectedValues, function(option) {
      var text, value;
      if (typeof option === 'object') {
        text = option[vm.optionsText], value = option[vm.optionsValue];
      } else {
        text = option, value = option;
      }
      return new OptionItem(text, value);
    });
    vm.options = ko.observableArray(options);

    vm.selectedValues = ko.observableArray(ko.utils.arrayFilter(selectedValues, function(value) {
      return vm.findOptionBy('value', value);
    }));
    if (!vm.isMultiple && !vm.selectedValues()[0] && vm.options()[0]) {
      vm.selectedValues().push(vm.options()[0].value);
    }

    /* computed observables */
    vm.selectedOptions = ko.pureComputed(function() {
      return ko.utils.arrayMap(vm.selectedValues(), function(value) {
        return vm.findOptionBy('value', value)
      });
    });

    vm.selectedSingleOption = ko.pureComputed(function() {
      return vm.selectedOptions()[0];
    });

    vm.singleText = ko.pureComputed(function() {
      return (vm.selectedSingleOption() || {}).text || vm.placeholder;
    });

    vm.singleValue = ko.pureComputed(function() {
      return (vm.selectedSingleOption() || {}).value;
    });

    vm.isSingleClearVisible = ko.pureComputed(function() {
      return vm.allowClear && vm.singleValue() && vm.placeholder;
    });

    vm.inputSize = ko.pureComputed(function() {
      return Math.max(vm.optionInput() === '' ? vm.inputPlaceholder().length : vm.optionInput().length, 1) + 1;
    });

    vm.inputPlaceholder = ko.pureComputed(function() {
      return vm.selectedValues().length === 0 ? vm.placeholder : "";
    });

    vm.stringInputValue = ko.pureComputed(function() {
      return vm.useStringInput ? vm.selectedValues().join(vm.stringInputSeparator) : "";
    });

    vm.isNoResultsVisible = ko.pureComputed(function() {
      return !vm.allowNew && vm.autocompleteOptions().length === 0;
    });

    vm.autocompleteOptions = ko.computed(function() {
      if (!vm.hasAutocomplete) return [];
      var text = vm.optionInput();
      var options = ko.utils.arrayFilter(vm.options(), function(t) {
        return (!vm.hideSelected || !vm.isSelected(t)) && t.text.indexOf(text) >= 0;
      });
      if (text !== '' && vm.allowNew) {
        if (!substringOption) {
          var substringOption = ko.utils.arrayFirst(options, function(t) { return t.text === text; });
          options.unshift(new OptionItem(text, vm.makeNewValue(text), { isNew: true, isPreview: true }));
        }
      }
      return options;
    });

    /* subscribers */
    vm.optionInput.subscribe(function() {
      vm.showAutocomplete();
    });

    vm.isFocused.subscribe(function(focused) {
      if (!focused) {
        vm.optionInput('');
        vm.hideAutocomplete();
      }
    });
  }

  SelectkoModel.prototype.findOptionBy = function(field, val) {
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
      this.selectAutocompleteOption();
    } else if (key === KEYS.tab || key === KEYS.enter || (key === KEYS.comma && !event.shiftKey)) {
      allow = !this.addFromInput() && key !== KEYS.enter && key !== KEYS.comma;
    } else if (this.isMultiple && key === KEYS.backspace && this.optionInput() === '' && this.selectedValues().length > 0) {
      var option = this.findOptionBy('value', this.selectedValues().slice(-1)[0]);
      if (this.unselectOption(option) && this.allowNew) this.optionInput(option.text);
    } else {
      allow = true;
    }
    return allow;
  }

  SelectkoModel.prototype.selectAutocompleteOption = function() {
    var option = this.autocompleteOptions()[this.autocompleteIndex()];
    if (!option || (option.isPreview && !this.allowNew)) return false;
    option.isPreview = false;
    return this.selectOption(option);
  }

  SelectkoModel.prototype.addFromInput = function() {
    var text = this.optionInput().replace(/^\s+|\s+$/gm, '');
    if (text === '') return false;
    var option = this.findOptionBy('text', text) || new OptionItem(text, this.makeNewValue(text), { isNew: true });
    return this.selectOption(option);
  }

  SelectkoModel.prototype.isSelected = function(option) {
    return this.selectedValues().indexOf(option.value) >= 0;
  }

  SelectkoModel.prototype.selectOption = function(option) {
    if (this.isSelected(option) || (option.isNew && !this.allowNew)) return false;

    if (!this.isMultiple) this.unselectOption(this.selectedSingleOption())
    if (option.isNew) this.options.push(option);
    this.selectedValues.push(option.value);
    this.optionInput('');
    this.hideAutocomplete();
    return true;
  }

  SelectkoModel.prototype.unselectOption = function(option) {
    if (!option) return false;
    this.selectedValues.remove(option.value);
    if (option.isNew) this.options.remove(option);
    return true;
  }

  SelectkoModel.prototype.removeSelectedOption = function(option) {
    this.unselectOption(option)
    this.showAutocomplete()
    this.isFocused(true)
  };

  SelectkoModel.prototype.hideAutocomplete = function() {
    this.isAutocompleteVisible(false);
  }

  SelectkoModel.prototype.showAutocomplete = function() {
    if (!this.hasAutocomplete) return;

    var options = this.autocompleteOptions();
    if (options.length > 0) {
      var index = 0, vm = this;
      if (options[0].isPreview && options.length > 1) {
        var option = ko.utils.arrayFirst(options, function(t) { return !t.isPreview && !vm.isSelected(t); });
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

  SelectkoModel.prototype.isStringInputEnabled = function() {
    return this.useStringInput || this.selectedValues().length === 0;
  }

  SelectkoModel.KEYS = SelectkoModel.KEYS || { up: 38, down: 40, enter: 13, tab: 9, backspace: 8, escape: 27, comma: 188 };

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

  ko.bindingHandlers.cancelMousedown = {
    init: function(el, valueAccessor, allBindings, viewModel, bindingContext) {
      if (ko.unwrap(valueAccessor()) === false) return;
      ko.applyBindingsToNode(el, { event: { mousedown: function(){} }, mousedownBubble: false }, bindingContext);
    }
  }

  ko.bindingHandlers.autocompleteOption = {
    init: function(el, valueAccessor, allBindings, viewModel, bindingContext) {
      var parent = bindingContext.$parent, data = bindingContext.$data;
      ko.applyBindingAccessorsToNode(el, {
        css: function() {
          return {
            selected: parent.isSelected(data),
            'new-option-preview': data.isPreview,
            highlight: valueAccessor()
          };
        },
        scrollIntoView: function() { return valueAccessor(); },
        html: function() { return data.displayText(parent.optionInput()) }
      }, bindingContext);

      ko.applyBindingsToNode(el, {
        event: {
          mouseup: parent.selectAutocompleteOption.bind(parent),
          mouseover: parent.autocompleteIndex.bind(parent, bindingContext.$index())
        },
        cancelMousedown: true
      }, bindingContext);
    },
  }

  ko.components.register('selectko', {
    viewModel: SelectkoModel,
    template: '\
      <div class="selectko-wrapper" data-bind="event: { mousedown: toggleAutocomplete }">\
        <select multiple data-bind="disable: isStringInputEnabled(), visible: false, attr: { name: formFieldName }, options: options, optionsText: \'text\', optionsValue:\'value\', selectedOptions: selectedValues"></select>\
        <input type="hidden" data-bind="enable: isStringInputEnabled(), attr: { name: formFieldName }, value: stringInputValue">\
      <!-- ko ifnot: isMultiple -->\
        <span class="single-text" data-bind="text: singleText, css: { placeholder: !singleValue() }"></span>\
        <span class="single-clear" data-bind="visible: isSingleClearVisible(), click: removeSelectedOption.bind($data, selectedSingleOption()), cancelMousedown: true">&times;</span>\
        <span class="single-arrow" data-bind="css: { \'arrow-up\': isAutocompleteVisible(), \'arrow-down\': !isAutocompleteVisible() }"></span>\
      <!-- /ko -->\
      <!-- ko if: isMultiple -->\
        <ul class="option-list">\
        <!-- ko foreach: selectedOptions -->\
          <li class="option">\
            <span data-bind="html: text"></span>\
            <a class="option-close" data-bind="click: $parent.removeSelectedOption.bind($parent, $data), cancelMousedown: true">&times;</a>\
          </li>\
        <!-- /ko -->\
          <li class="option-input">\
            <input type="text" tabindex="0" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"\
                   data-bind="textInput: optionInput, event: { keydown: onKeyDown }, hasFocus: isFocused, attr: { size: inputSize, placeholder: inputPlaceholder }">\
          </li>\
        </ul>\
      <!-- /ko -->\
        <div class="autocomplete-wrapper" data-bind="visible: isAutocompleteVisible, setTopPosition: isAutocompleteVisible, css: { \'autocomplete-below\': isAutocompleteBelow(), \'autocomplete-above\': !isAutocompleteBelow() }">\
        <!-- ko ifnot: isMultiple -->\
          <span class="single-input-wrapper">\
            <input type="text" tabindex="0" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"\
                   data-bind="textInput: optionInput, event: { keydown: onKeyDown }, cancelMousedown: true, hasFocus: isFocused">\
          </span>\
        <!-- /ko -->\
          <span class="no-results-message" data-bind="visible: isNoResultsVisible, text: noResultsText"></span>\
          <ul class="autocomplete" data-bind="foreach: autocompleteOptions, resetScrollTop: isAutocompleteVisible">\
            <li data-bind="autocompleteOption: $index() === $parent.autocompleteIndex()"></li>\
          </ul>\
        </div>\
      </div>\
    '
  });

})();
