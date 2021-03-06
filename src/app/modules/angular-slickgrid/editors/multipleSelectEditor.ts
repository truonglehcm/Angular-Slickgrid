import { TranslateService } from '@ngx-translate/core';
import {
  Column,
  Editor,
  EditorValidator,
  EditorValidatorOutput,
  GridOption,
  MultipleSelectOption,
  SelectOption,
} from './../models/index';
import { CollectionService } from '../services/index';
import { arraysEqual, htmlEncode } from '../services/utilities';
import * as sanitizeHtml_ from 'sanitize-html';
const sanitizeHtml = sanitizeHtml_; // patch to fix rollup to work

// height in pixel of the multiple-select DOM element
const SELECT_ELEMENT_HEIGHT = 26;

// using external non-typed js libraries
declare var $: any;

/**
 * Slickgrid editor class for multiple select lists
 */
export class MultipleSelectEditor implements Editor {
  /** The JQuery DOM element */
  $editorElm: any;

  /** Editor Multiple-Select options */
  editorElmOptions: MultipleSelectOption;

  /** The multiple-select options for a multiple select list */
  defaultOptions: MultipleSelectOption;

  /** The default item values that are set */
  defaultValue: any[];

  /** The options label/value object to use in the select list */
  collection: SelectOption[] = [];

  /** The property name for values in the collection */
  valueName: string;

  /** The property name for labels in the collection */
  labelName: string;

  /** The property name for a prefix that can be added to the labels in the collection */
  labelPrefixName: string;

  /** The property name for a suffix that can be added to the labels in the collection */
  labelSuffixName: string;

  /** Grid options */
  gridOptions: GridOption;

  /** Do we translate the label? */
  enableTranslateLabel: boolean;

  /** The i18n aurelia library */
  private _translate: TranslateService;

  constructor(private args: any) {
    this.gridOptions = this.args.grid.getOptions() as GridOption;
    const options = this.gridOptions || this.args.column.params || {};
    this._translate = options.i18n;

    this.defaultOptions = {
      container: 'body',
      filter: false,
      maxHeight: 200,
      addTitle: true,
      okButton: true,
      selectAllDelimiter: ['', ''],
      width: 150,
      offsetLeft: 20,
      onOpen: () => this.autoAdjustDropPosition(this.$editorElm, this.editorElmOptions),
      textTemplate: ($elm) => {
        // render HTML code or not, by default it is sanitized and won't be rendered
        const isRenderHtmlEnabled = this.columnDef && this.columnDef.internalColumnEditor && this.columnDef.internalColumnEditor.enableRenderHtml || false;
        return isRenderHtmlEnabled ? $elm.text() : $elm.html();
      },
    };

    if (this._translate) {
      this.defaultOptions.countSelected = this._translate.instant('X_OF_Y_SELECTED');
      this.defaultOptions.allSelected = this._translate.instant('ALL_SELECTED');
      this.defaultOptions.selectAllText = this._translate.instant('SELECT_ALL');
    }

    this.init();
  }

  /** Get Column Definition object */
  get columnDef(): Column {
    return this.args && this.args.column || {};
  }

  /** Get Column Editor object */
  get columnEditor(): any {
    return this.columnDef && this.columnDef.internalColumnEditor && this.columnDef.internalColumnEditor || {};
  }

  /**
   * The current selected values from the collection
   */
  get currentValues() {
    return this.collection
      .filter(c => this.$editorElm.val().indexOf(c[this.valueName].toString()) !== -1)
      .map(c => c[this.valueName]);
  }

  /** Get the Validator function, can be passed in Editor property or Column Definition */
  get validator(): EditorValidator {
    return this.columnEditor.validator || this.columnDef.validator;
  }

  init() {
    if (!this.args) {
      throw new Error('[Angular-SlickGrid] An editor must always have an "init()" with valid arguments.');
    }

    if (!this.columnDef || !this.columnDef.internalColumnEditor || !this.columnDef.internalColumnEditor.collection) {
      throw new Error(`[Angular-SlickGrid] You need to pass a "collection" inside Column Definition Editor for the MultipleSelect Editor to work correctly.
      Also each option should include a value/label pair (or value/labelKey when using Locale).
      For example: { editor: { collection: [{ value: true, label: 'True' },{ value: false, label: 'False'}] } }`);
    }

    const collectionService = new CollectionService(this._translate);
    this.enableTranslateLabel = (this.columnDef.internalColumnEditor.enableTranslateLabel) ? this.columnDef.internalColumnEditor.enableTranslateLabel : false;
    let newCollection =  this.columnDef.internalColumnEditor.collection || [];
    this.labelName = (this.columnDef.internalColumnEditor.customStructure) ? this.columnDef.internalColumnEditor.customStructure.label : 'label';
    this.labelPrefixName = (this.columnDef.internalColumnEditor.customStructure) ? this.columnDef.internalColumnEditor.customStructure.labelPrefix : 'labelPrefix';
    this.labelSuffixName = (this.columnDef.internalColumnEditor.customStructure) ? this.columnDef.internalColumnEditor.customStructure.labelSuffix : 'labelSuffix';
    this.valueName = (this.columnDef.internalColumnEditor.customStructure) ? this.columnDef.internalColumnEditor.customStructure.value : 'value';

    // user might want to filter certain items of the collection
    if (this.columnDef.internalColumnEditor && this.columnDef.internalColumnEditor.collectionSortBy) {
      const filterBy = this.columnDef.internalColumnEditor.collectionFilterBy;
      newCollection = collectionService.filterCollection(newCollection, filterBy);
    }

    // user might want to sort the collection
    if (this.columnDef.internalColumnEditor && this.columnDef.internalColumnEditor.collectionSortBy) {
      const sortBy = this.columnDef.internalColumnEditor.collectionSortBy;
      newCollection = collectionService.sortCollection(newCollection, sortBy, this.enableTranslateLabel);
    }

    this.collection = newCollection;
    const editorTemplate = this.buildTemplateHtmlString(newCollection);

    this.createDomElement(editorTemplate);
  }

  applyValue(item: any, state: any): void {
    item[this.columnDef.field] = state;
  }

  destroy() {
    this.$editorElm.remove();
  }

  loadValue(item: any): void {
    // convert to string because that is how the DOM will return these values
    this.defaultValue = item[this.columnDef.field].map((i: any) => i.toString());

    this.$editorElm.find('option').each((i: number, $e: any) => {
      if (this.defaultValue.indexOf($e.value) !== -1) {
        $e.selected = true;
      } else {
        $e.selected = false;
      }
    });

    this.refresh();
  }

  serializeValue(): any {
    return this.currentValues;
  }

  focus() {
    this.$editorElm.focus();
  }

  isValueChanged(): boolean {
    return !arraysEqual(this.$editorElm.val(), this.defaultValue);
  }

  validate(): EditorValidatorOutput {
    if (this.validator) {
      const validationResults = this.validator(this.currentValues);
      if (!validationResults.valid) {
        return validationResults;
      }
    }

    // by default the editor is always valid
    // if user want it to be a required checkbox, he would have to provide his own validator
    return {
      valid: true,
      msg: null
    };
  }

  private buildTemplateHtmlString(collection: any[]) {
    let options = '';
    const isRenderHtmlEnabled = this.columnDef && this.columnDef.internalColumnEditor && this.columnDef.internalColumnEditor.enableRenderHtml || false;
    const sanitizedOptions = this.gridOptions && this.gridOptions.sanitizeHtmlOptions || {};

    collection.forEach((option: SelectOption) => {
      if (!option || (option[this.labelName] === undefined && option.labelKey === undefined)) {
        throw new Error(`A collection with value/label (or value/labelKey when using Locale) is required to populate the Select list, for example: { collection: [ { value: '1', label: 'One' } ])`);
      }
      const labelKey = (option.labelKey || option[this.labelName]) as string;
      const labelText = ((option.labelKey || this.enableTranslateLabel) && this._translate && typeof this._translate.instant === 'function') ? this._translate.instant(labelKey || ' ') : labelKey;
      const prefixText = option[this.labelPrefixName] || '';
      const suffixText = option[this.labelSuffixName] || '';
      let optionText = prefixText + labelText + suffixText;

      // if user specifically wants to render html text, he needs to opt-in else it will stripped out by default
      // also, the 3rd party lib will saninitze any html code unless it's encoded, so we'll do that
      if (isRenderHtmlEnabled) {
        // sanitize any unauthorized html tags like script and others
        // for the remaining allowed tags we'll permit all attributes
        const sanitizeText = sanitizeHtml(optionText, sanitizedOptions);
        optionText = htmlEncode(sanitizeText);
      }

      options += `<option value="${option[this.valueName]}">${optionText}</option>`;
    });

    return `<select class="ms-filter search-filter" multiple="multiple">${options}</select>`;
  }

  /**
   * Automatically adjust the multiple-select dropup or dropdown by available space
   */
  private autoAdjustDropPosition(multipleSelectDomElement: any, multipleSelectOptions: MultipleSelectOption) {
    // height in pixel of the multiple-select element
    const selectElmHeight = SELECT_ELEMENT_HEIGHT;

    const windowHeight = $(window).innerHeight() || 300;
    const pageScroll = $('body').scrollTop() || 0;
    const $msDropContainer = multipleSelectOptions.container ? $(multipleSelectOptions.container) : multipleSelectDomElement;
    const $msDrop = $msDropContainer.find('.ms-drop');
    const msDropHeight = $msDrop.height() || 0;
    const msDropOffsetTop = $msDrop.offset().top;
    const space = windowHeight - (msDropOffsetTop - pageScroll);

    if (space < msDropHeight) {
      if (multipleSelectOptions.container) {
        // when using a container, we need to offset the drop ourself
        // and also make sure there's space available on top before doing so
        const newOffsetTop = (msDropOffsetTop - msDropHeight - selectElmHeight);
        if (newOffsetTop > 0) {
          $msDrop.offset({ top: newOffsetTop < 0 ? 0 : newOffsetTop });
        }
      } else {
        // without container, we simply need to add the "top" class to the drop
        $msDrop.addClass('top');
      }
      $msDrop.removeClass('bottom');
    } else {
      $msDrop.addClass('bottom');
      $msDrop.removeClass('top');
    }
  }

  /** Build the template HTML string */
  private createDomElement(editorTemplate: string) {
    this.$editorElm = $(editorTemplate);

    if (this.$editorElm && typeof this.$editorElm.appendTo === 'function') {
      this.$editorElm.appendTo(this.args.container);
    }

    if (typeof this.$editorElm.multipleSelect !== 'function') {
      // fallback to bootstrap
      this.$editorElm.addClass('form-control');
    } else {
      const elementOptions = (this.columnDef.internalColumnEditor) ? this.columnDef.internalColumnEditor.elementOptions : {};
      this.editorElmOptions = { ...this.defaultOptions, ...elementOptions };
      this.$editorElm = this.$editorElm.multipleSelect(this.editorElmOptions);
      setTimeout(() => this.$editorElm.multipleSelect('open'));
    }
  }

  // refresh the jquery object because the selected checkboxes were already set
  // prior to this method being called
  private refresh() {
    if (typeof this.$editorElm.multipleSelect === 'function') {
      this.$editorElm.multipleSelect('refresh');
    }
  }
}
