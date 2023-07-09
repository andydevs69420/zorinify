/*
 * Zorin Menu: The official applications menu for Zorin OS.
 *
 * Copyright (C) 2016-2021 Zorin OS Technologies Ltd.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// Import Libraries
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const PopupMenu = imports.ui.popupMenu;
const Signals = imports.signals;
const SystemActions = imports.misc.systemActions;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Widgets = Me.imports.widgets;
const Sections = Me.imports.sections;

// Menu Layout Enum
var layouts = {
    ALL: 0,
    APPS_ONLY: 1,
    SYSTEM_ONLY: 2,
    APP_GRID: 3
};

function getLayout(settings, appsBackend) {
    let layoutSetting = settings.get_enum('layout');
    switch(layoutSetting) {
        case layouts.ALL:
            return new StandardLayout(appsBackend);
        case layouts.APPS_ONLY:
            return new AppListLayout(appsBackend);
        case layouts.SYSTEM_ONLY:
            return new ShortcutsLayout(appsBackend);
        case layouts.APP_GRID:
            return new AppGridLayout(appsBackend);
        default:
            return new StandardLayout(appsBackend);
    }
}

// Base Layout
var BaseLayout = class {
    constructor(appsBackend) {
        this.actor = new St.BoxLayout({
            vertical: false
        });
        this._appsBackend = appsBackend;
        this._loadLayout();
        this._connectSignals();
        this.reset();
        this.actor.connect('key-press-event', this._onKeyPress.bind(this));
        this.actor.connect('destroy', this._onDestroy.bind(this));
    }

    show() {
        this.actor.show();
    }

    hide() {
        this.actor.hide();
    }

    _loadLayout() {
        this.emit('loaded-layout');
    }

    _connectSignals() {
        this.emit('connected-signals');
    }

    // Handle key presses
    _onKeyPress(actor, event) {
        return Clutter.EVENT_PROPAGATE;
    }

    reset(){
        this.emit('reset');
    }

    _activated() {
        this.emit('activated');
    }

    _onDestroy() {
        this.emit('destroy');
    }
    
    destroy() {
        this.actor.destroy();
    }
};
Signals.addSignalMethods(BaseLayout.prototype);

// Standard Layout
var StandardLayout = class extends BaseLayout {
    // Initialize the layout
    constructor(appsBackend) {
        super(appsBackend);
        this.actor.add_style_class_name("main-box");
        this.actor.add_style_class_name("all-layout-box");
    }

    _loadLayout() {
        // Create Sections and Widgets
        this._categoriesSection = new Sections.CategoriesListSection(this._appsBackend);
        this._appsSection = new Sections.AppsListSection(this._appsBackend, false);
        this._searchEntry = new Widgets.SearchEntry();
        this._backButton = new Widgets.BackMenuItem();
        this._userItem = new Widgets.UserMenuItem();
        this._placesSection = new Sections.PlacesSection();
        this._shortcutsSection = new Sections.ShortcutsSection();
        this._sessionButtonsSection = new Sections.SessionButtonsSection();
        this._verticalSeparator = new Widgets.VerticalSeparator();

        // Create Boxes
        this._leftBox = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            vertical: true,
            y_align: Clutter.ActorAlign.FILL,
            style_class: 'apps-box'
        });
        this._rightBox = new St.BoxLayout({
            vertical: true,
            style_class: 'shortcuts-box'
        });

        // Fill Left Box
        this._leftBox.add_child(this._categoriesSection);
        this._leftBox.add_child(this._appsSection);
        this._leftBox.add_child(this._backButton);
        this._leftBox.add_child(this._searchEntry);

        // Fill Right Box
        this._rightBox.add_child(this._userItem);
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this._rightBox.add_child(separator);
        this._rightBox.add_child(this._placesSection);
        separator = new PopupMenu.PopupSeparatorMenuItem();
        this._rightBox.add_child(separator);
        this._rightBox.add_child(this._shortcutsSection);
        separator = new PopupMenu.PopupSeparatorMenuItem();
        this._rightBox.add_child(separator);
        this._rightBox.add_child(this._sessionButtonsSection);

        // Add Boxes
        this.actor.add_child(this._leftBox);
        this.actor.add_child(this._verticalSeparator.actor);
        this.actor.add_child(this._rightBox);
    }

    _connectSignals() {
        this._categoriesSection.connect('selected', this._onSelectCategory.bind(this));
        this._appsSection.connect('activated', this._activated.bind(this));
        this._searchEntry.connect('cleared', this._onSearchCleared.bind(this));
        this._searchEntry.connect('search', this._onSearch.bind(this));
        this._backButton.connect('activated', this.reset.bind(this));
        this._userItem.connect('activated', this._activated.bind(this));
        this._placesSection.connect('activated', this._activated.bind(this));
        this._shortcutsSection.connect('activated', this._activated.bind(this));
        this._sessionButtonsSection.connect('activated', this._activated.bind(this));

	this._categoriesSection.connect('block-activate', () => this.emit('block-activate'));
	this._appsSection.connect('block-activate', () => this.emit('block-activate'));
	this._backButton.connectBlockActivate(this);
	this._userItem.connectBlockActivate(this);
	this._placesSection.connectBlockActivate(this);
	this._shortcutsSection.connectBlockActivate(this);
    }

    // Carry out a search based on the search text entry value
    _onSearch(actor, pattern){
        if (pattern) {
            this._appsSection.searchApps(pattern);
            this._categoriesSection.hide();
            this._appsSection.show();
            this._backButton.show();
            this._appsSection.grab_key_focus();
        }
    }

    _onSearchCleared(){
        this._appsSection.hide();
        this._backButton.hide();
        this._categoriesSection.show();
    }

    _onSelectCategory(actor, category_menu_id){
        if (category_menu_id) {
            this._appsSection.selectCategory(category_menu_id);
            this._categoriesSection.hide();
            this._appsSection.show();
            this._backButton.show();
            this._searchEntry.grab_key_focus();
        }
    }

    // Handle key presses
    _onKeyPress(actor, event) {
        if (event.has_control_modifier()) {
            this._searchEntry.grab_key_focus();
            return Clutter.EVENT_PROPAGATE;
        }

        let symbol = event.get_key_symbol();

        switch(symbol) {
            case Clutter.KEY_BackSpace:
                if (!this._searchEntry.has_key_focus()) {
                    this._searchEntry.grab_key_focus();
                    let newText = this._searchEntry.getText().slice(0, -1);
                    this._searchEntry.setText(newText);
                }
                return Clutter.EVENT_PROPAGATE;
            case Clutter.KEY_Tab:
            case Clutter.KEY_KP_Tab:
            case Clutter.Up:
            case Clutter.KP_Up:
            case Clutter.Down:
            case Clutter.KP_Down:
            case Clutter.Left:
            case Clutter.KP_Left:
            case Clutter.Right:
            case Clutter.KP_Right:
                return Clutter.EVENT_PROPAGATE;
            default:
                let key = event.get_key_unicode();
                if (key.length != 0) {
                    this._searchEntry.grab_key_focus();
                    let newText = this._searchEntry.getText() + key;
                    this._searchEntry.setText(newText);
                }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    reset() {
        this._searchEntry.clear();
    }
};

// App List Layout
var AppListLayout = class extends BaseLayout {
    // Initialize the layout
    constructor(appsBackend) {
        super(appsBackend);
        this.actor.add_style_class_name("main-box");
        this.actor.add_style_class_name("apps-only-layout-box");
    }

    _loadLayout() {
        // Create Sections and Widgets
        this._categoriesSection = new Sections.CategoriesListSection(this._appsBackend);
        this._appsSection = new Sections.AppsListSection(this._appsBackend, false);
        this._searchEntry = new Widgets.SearchEntry();
        this._backButton = new Widgets.BackMenuItem();

        // Create Box
        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'apps-box'
        });

        // Fill Box
        this._box.add_child(this._categoriesSection);
        this._box.add_child(this._appsSection);
        this._box.add_child(this._backButton);
        this._box.add_child(this._searchEntry);
        
        // Add Box
        this.actor.add_child(this._box);
    }

    _connectSignals() {
        this._categoriesSection.connect('selected', this._onSelectCategory.bind(this));
        this._appsSection.connect('activated', this._activated.bind(this));
        this._searchEntry.connect('cleared', this._onSearchCleared.bind(this));
        this._searchEntry.connect('search', this._onSearch.bind(this));
        this._backButton.connect('activated', this.reset.bind(this));

	this._categoriesSection.connect('block-activate', () => this.emit('block-activate'));
	this._appsSection.connect('block-activate', () => this.emit('block-activate'));
        this._backButton.connectBlockActivate(this);
    }

    // Carry out a search based on the search text entry value
    _onSearch(actor, pattern){
        if (pattern) {
            this._appsSection.searchApps(pattern);
            this._categoriesSection.hide();
            this._appsSection.show();
            this._backButton.show();
            this._appsSection.grab_key_focus();
        }
    }

    _onSearchCleared(){
        this._appsSection.hide();
        this._backButton.hide();
        this._categoriesSection.show();
    }

    _onSelectCategory(actor, category_menu_id){
        if (category_menu_id) {
            this._appsSection.selectCategory(category_menu_id);
            this._categoriesSection.hide();
            this._appsSection.show();
            this._backButton.show();
            this._searchEntry.grab_key_focus();
        }
    }

    // Handle key presses
    _onKeyPress(actor, event) {
        if (event.has_control_modifier()) {
            this._searchEntry.grab_key_focus();
            return Clutter.EVENT_PROPAGATE;
        }

        let symbol = event.get_key_symbol();

        switch(symbol) {
            case Clutter.KEY_BackSpace:
                if (!this._searchEntry.has_key_focus()) {
                    this._searchEntry.grab_key_focus();
                    let newText = this._searchEntry.getText().slice(0, -1);
                    this._searchEntry.setText(newText);
                }
                return Clutter.EVENT_PROPAGATE;
            case Clutter.KEY_Tab:
            case Clutter.KEY_KP_Tab:
            case Clutter.Up:
            case Clutter.KP_Up:
            case Clutter.Down:
            case Clutter.KP_Down:
            case Clutter.Left:
            case Clutter.KP_Left:
            case Clutter.Right:
            case Clutter.KP_Right:
                return Clutter.EVENT_PROPAGATE;
            default:
                let key = event.get_key_unicode();
                if (key.length != 0) {
                    this._searchEntry.grab_key_focus();
                    let newText = this._searchEntry.getText() + key;
                    this._searchEntry.setText(newText);
                }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    reset(){
        this._searchEntry.clear();
    }
};

// Shortcuts Layout
var ShortcutsLayout = class extends BaseLayout {
    // Initialize the layout
    constructor(appsBackend) {
        super(appsBackend);
        this.actor.add_style_class_name("shortcuts-only-layout-box");
    }

    _loadLayout() {
        // Create Sections and Widgets
        this._userItem = new Widgets.UserMenuItem();
        this._placesSection = new Sections.PlacesSection();
        this._shortcutsSection = new Sections.ShortcutsSection();
        this._sessionButtonsSection = new Sections.SessionButtonsSection();

        // Create Box
        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'shortcuts-box'
        });

        // Fill Box
        this._box.add_child(this._userItem);
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this._box.add_child(separator);
        this._box.add_child(this._placesSection);
        separator = new PopupMenu.PopupSeparatorMenuItem();
        this._box.add_child(separator);
        this._box.add_child(this._shortcutsSection);
        separator = new PopupMenu.PopupSeparatorMenuItem();
        this._box.add_child(separator);
        this._box.add_child(this._sessionButtonsSection);
        
        // Add Box
        this.actor.add_child(this._box);
    }

    _connectSignals() {
        this._userItem.connect('activated', this._activated.bind(this));
        this._placesSection.connect('activated', this._activated.bind(this));
        this._shortcutsSection.connect('activated', this._activated.bind(this));
        this._sessionButtonsSection.connect('activated', this._activated.bind(this));
    }
};

// App Grid Layout
var AppGridLayout = class extends BaseLayout {
    // Initialize the layout
    constructor(appsBackend) {
        super(appsBackend);
        this.actor.add_style_class_name("main-box");
        this.actor.add_style_class_name("grid-layout-box");
    }

    _loadLayout() {
        // Create Sections and Widgets
        this._searchEntry = new Widgets.SearchEntry();
        this._appsSection = new Sections.AppsListSection(this._appsBackend, true);
        this._systemActions = new SystemActions.getDefault();
        this._systemActions.forceUpdate();
        this._userButton = new Widgets.UserMenuButton(this._systemActions);
        this._userButton.x_align = Clutter.ActorAlign.START;
        this._separator = new PopupMenu.PopupSeparatorMenuItem();
        this._power = new Widgets.PowerMenuButton(this._systemActions);
        this._power.x_align = Clutter.ActorAlign.END;
        this._power.x_expand = true;

        // Create and Fill Session Box
        this._sessionBox = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'session-box'
        });
        this._sessionBox.add_child(this._userButton);
        this._sessionBox.add_child(this._power);

        // Create Box
        this._box = new St.BoxLayout({
            vertical: true,
            style_class: 'grid-box'
        });

        // Fill Box
        this._box.add_child(this._searchEntry);
        this._box.add_child(this._appsSection);
        this._box.add_child(this._separator);
        this._box.add_child(this._sessionBox);
        
        // Add Box
        this.actor.add_child(this._box);
    }

    _connectSignals() {
        this._appsSection.connect('activated', this._activated.bind(this));
        this._searchEntry.connect('cleared', this._onSearchCleared.bind(this));
        this._searchEntry.connect('search', this._onSearch.bind(this));
        this._userButton.connect('activated', this._activated.bind(this));
        this._power.connect('activated', this._activated.bind(this));

	this._userButton.connectBlockActivate(this._appsSection);
    }

    // Carry out a search based on the search text entry value
    _onSearch(actor, pattern){
        if (pattern) {
            this._appsSection.searchApps(pattern);
            this._appsSection.grab_key_focus();
        }
    }

    _onSearchCleared(){
        this._appsSection.displayAllApps();
        this._appsSection.grab_key_focus();
    }

    // Handle key presses
    _onKeyPress(actor, event) {
        if (event.has_control_modifier()) {
            this._searchEntry.grab_key_focus();
            return Clutter.EVENT_PROPAGATE;
        }

        let symbol = event.get_key_symbol();

        switch(symbol) {
            case Clutter.KEY_BackSpace:
                if (!this._searchEntry.has_key_focus()) {
                    this._searchEntry.grab_key_focus();
                    let newText = this._searchEntry.getText().slice(0, -1);
                    this._searchEntry.setText(newText);
                }
                return Clutter.EVENT_PROPAGATE;
            case Clutter.KEY_Tab:
            case Clutter.KEY_KP_Tab:
            case Clutter.Up:
            case Clutter.KP_Up:
            case Clutter.Down:
            case Clutter.KP_Down:
            case Clutter.Left:
            case Clutter.KP_Left:
            case Clutter.Right:
            case Clutter.KP_Right:
                return Clutter.EVENT_PROPAGATE;
            default:
                let key = event.get_key_unicode();
                if (key.length != 0) {
                    this._searchEntry.grab_key_focus();
                    let newText = this._searchEntry.getText() + key;
                    this._searchEntry.setText(newText);
                }
        }
        return Clutter.EVENT_PROPAGATE;
    }
    
    reset(){
        this._searchEntry.clear();
    }
};
