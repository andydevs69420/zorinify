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
const PopupMenu = imports.ui.popupMenu;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const Signals = imports.signals;
const SystemActions = imports.misc.systemActions;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Widgets = Me.imports.widgets;

// User Home directories
const DEFAULT_DIRECTORIES = [
    GLib.UserDirectory.DIRECTORY_DESKTOP,
    GLib.UserDirectory.DIRECTORY_DOCUMENTS,
    GLib.UserDirectory.DIRECTORY_DOWNLOAD,
    GLib.UserDirectory.DIRECTORY_MUSIC,
    GLib.UserDirectory.DIRECTORY_PICTURES,
    GLib.UserDirectory.DIRECTORY_VIDEOS
];

// Session Buttons Section
var SessionButtonsSection = GObject.registerClass({
    Signals: {
        'activated': {}
    },
}, class SessionButtonsSection extends PopupMenu.PopupBaseMenuItem {
    // Initialize the button
    _init() {
        super._init({
            reactive: false,
            can_focus: false,
            style_class: 'session-buttons-section'
        });
        this.x_align = Clutter.ActorAlign.CENTER;
        this.y_align = Clutter.ActorAlign.END;
        this.y_expand = true;
        this._systemActions = new SystemActions.getDefault();
        this._systemActions.forceUpdate();

        // Add session buttons to section
        this._logout = new Widgets.LogoutButton(this._systemActions);
        this._logout.connect('activated', this._activated.bind(this));
        this.add_child(this._logout);
        
        this._lock = new Widgets.LockButton(this._systemActions);
        this._lock.connect('activated', this._activated.bind(this));
        this.add_child(this._lock);

        this._restart = new Widgets.RestartButton(this._systemActions);
        this._restart.connect('activated', this._activated.bind(this));
        this.add_child(this._restart);

        this._power = new Widgets.PowerButton(this._systemActions);
        this._power.connect('activated', this._activated.bind(this));
        this.add_child(this._power);
    }

    // Emit signal if one of the buttons is activated
    _activated() {
        this.emit('activated');
    }
});


// Places Shortcut Section
var PlacesSection = GObject.registerClass({
    Signals: {
        'activated': {}
    },
}, class PlacesSection extends St.BoxLayout {
    _init(session, accessible_name, icon_name) {
        super._init({
            vertical: true
        });
        this._items = [];

        // Fix for when XDG User Dirs are empty due to being cached too early during initialization
        GLib.reload_user_special_dirs_cache();

        let homePath = GLib.get_home_dir();
        let placeInfo = new Widgets.PlaceInfo(Gio.File.new_for_path(homePath), _("Home"));
        let placeMenuItem = new Widgets.PlaceMenuItem(placeInfo);
        this._items.push(placeMenuItem);

        for (let i = 0; i < DEFAULT_DIRECTORIES.length; i++) {
            let path = GLib.get_user_special_dir(DEFAULT_DIRECTORIES[i]);
            if (path == null || path == homePath)
                continue;
            let placeInfo = new Widgets.PlaceInfo(Gio.File.new_for_path(path));
            let placeMenuItem = new Widgets.PlaceMenuItem(placeInfo);
            this._items.push(placeMenuItem);
        }

        this._items.forEach(function(item) {
            this.add_child(item);
            item.connect('activated', this._activated.bind(this));
        }, this);
    }

    connectBlockActivate(actor) {
        this._items.forEach(function(item) {
            item.connectBlockActivate(actor);
        });
    }

    // Emit signal if one of the buttons is activated
    _activated() {
        this.emit('activated');
    }
});

// Shortcuts Section
var ShortcutsSection = GObject.registerClass({
    Signals: {
        'activated': {}
    },
}, class ShortcutsSection extends St.BoxLayout {
    _init(session, accessible_name, icon_name) {
        super._init({
            vertical: true
        });
        this._items = [];

        let software = new Widgets.ShortcutMenuItem(_("Software"), "gnome-software", "gnome-software-symbolic", "org.gnome.Software-symbolic");
        this._items.push(software);

        let settings = new Widgets.ShortcutMenuItem(_("Settings"), "gnome-control-center", "preferences-system-symbolic");
        this._items.push(settings);

        let zorin_appearance = new Widgets.ShortcutMenuItem(_("Zorin Appearance"), "zorin-appearance", "zorin-appearance-symbolic");
        this._items.push(zorin_appearance);

        this._items.forEach(function(item) {
            this.add_child(item.actor);
            item.connect('activated', this._activated.bind(this));
        }, this);
    }

    connectBlockActivate(actor) {
        this._items.forEach(function(item) {
            item.connectBlockActivate(actor);
        });
    }

    // Emit signal if one of the buttons is activated
    _activated() {
        this.emit('activated');
    }
});

// Categories List Section
var CategoriesListSection = GObject.registerClass({
    Signals: {
        'selected': { param_types: [GObject.TYPE_STRING] },
        'block-activate': {}
    },
}, class CategoriesListSection extends St.Bin {
    // Initialize the button
    _init(appsBackend) {
        super._init({ x_expand: true, y_expand: true});
        this._appsBackend = appsBackend;
        this._categories = [];
        this._categoryButtons = new Map();
        this._categoriesBox = new St.BoxLayout({ vertical: true });
        this._scrollBox = new Widgets.ScrollView({
                x_expand: true,
                y_expand: true, 
                y_align: Clutter.ActorAlign.START,
                style_class: 'apps-menu vfade',
                overlay_scrollbars: true,
                reactive:true
        });
        
        this._scrollBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._scrollBox.clip_to_allocation = true;
        this._scrollBox.add_actor(this._categoriesBox); // Only use add_actor as add_child and set_child don't work with scrollviews
        this.set_child(this._scrollBox);
        this._scrollBox.connect('block-activate', () => this.emit('block-activate'));
        this._load();
        this._reloadId = this._appsBackend.connect('reload', this._reload.bind(this));
        this.connect('destroy', this._onDestroy.bind(this));
    }

    _load() {
        this._categories = this._appsBackend.getCategories();
        this._categories.forEach(this._addCategoryButton, this);
    }

    _reload() {
        this._categories = [];
        this._clear();
        this._load();
    }

    _addCategoryButton(category) {
        let button = this._categoryButtons.get(category);
        if (!button) {
            button = new Widgets.CategoryMenuItem(category);
            this._categoryButtons.set(category, button);
            button.connect('selected', this._selected.bind(this));
            button.connect('scroll', this._scrollToButton.bind(this));
            button.connectBlockActivate(this._scrollBox);
        }
        if (!button.get_parent()) {
            this._categoriesBox.add_child(button);
        }
    }

    // Clear the categories box
    _clear() {
        this._categoriesBox.remove_all_children();
    }

    // Scroll to a specific button (menu item) in the categories scroll view
    _scrollToButton(button) {
        if (button) {
            let scrollBoxAdj = this._scrollBox.get_vscroll_bar().get_adjustment();
            let scrollBoxAlloc = this._scrollBox.get_allocation_box();
            let currentScrollValue = scrollBoxAdj.get_value();
            let boxHeight = scrollBoxAlloc.y2 - scrollBoxAlloc.y1;
            let buttonAlloc = button.get_allocation_box();
            let newScrollValue = currentScrollValue;
            if (currentScrollValue > buttonAlloc.y1 - 10)
                newScrollValue = buttonAlloc.y1 - 10;
            if (boxHeight + currentScrollValue < buttonAlloc.y2 + 10)
                newScrollValue = buttonAlloc.y2 - boxHeight + 10;
            if (newScrollValue != currentScrollValue)
                scrollBoxAdj.set_value(newScrollValue);
        }
    }

    _selected(actor, category_menu_id) {
        this.emit('selected', category_menu_id);
    }

    grab_key_focus() {
        let item = this._categoriesBox.get_first_child();
        if (item) {
            item.grab_key_focus();
        }
    }

    show() {
        super.show();
        let item = this._categoriesBox.get_first_child();
        if (item) {
            item.grab_key_focus();
        }
    }

    _onDestroy() {
        this._appsBackend.disconnect(this._reloadId);
        this._reloadId = 0;
        this._categories = null;
        this._categoryButtons.clear();
    }
});

const COLUMN_SPACING = 16;
const ROW_SPACING = 16;
const COLUMN_COUNT = 6;

// Apps List Section
var AppsListSection = GObject.registerClass({
    Signals: {
        'activated': {},
        'block-activate': {}
    },
}, class AppsListSection extends St.Bin {
    // Initialize the button
    _init(appsBackend, isGrid) {
        super._init({ x_expand: true, y_expand: true});
        this._appsBackend = appsBackend;
        this._appButtons = new Map();
        this._category = null;
        this._searchPattern = null;
        this._appsBox = new St.BoxLayout({ vertical: true });
        
        if (isGrid) {
            this.grid = new Widgets.Grid(COLUMN_COUNT, COLUMN_SPACING, ROW_SPACING);
            this._appsBox.add(this.grid);
        }
        this._scrollBox = new Widgets.ScrollView({
                x_expand: true,
                y_expand: true, 
                y_align: Clutter.ActorAlign.START,
                style_class: 'apps-menu vfade',
                overlay_scrollbars: true,
                reactive:true
        });
        this._scrollBox.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
        this._scrollBox.clip_to_allocation = true;
        this._scrollBox.add_actor(this._appsBox); // Only use add_actor as add_child and set_child don't work with scrollviews
        this.set_child(this._scrollBox);
        this._scrollBox.connect('block-activate', () => this.emit('block-activate'));
        this._load();
        this._reloadId = this._appsBackend.connect('reload', this._reload.bind(this));
        this.connect('destroy', this._onDestroy.bind(this));
    }

    _display(apps) {
        if (apps) {
            apps.forEach(this._addAppButton, this);
        }
    }

    _load() {
        if (this._category) {
            this.selectCategory(this._category);
        } else if (this._searchPattern) {
            this.searchApps(this._searchPattern);
        } else {
            this.displayAllApps();
        }
    }

    _reload() {
        this._clear();
        this._load();
    }

    // Emit signal if one of the buttons is activated
    _activated() {
        this.emit('activated');
    }

    _addAppButton(app) {
        let button = this._appButtons.get(app);
        if (!button) {
            button = new Widgets.AppMenuItem(app, (this.grid != null));
            this._appButtons.set(app, button);
            button.connect('activated', this._activated.bind(this));
            button.connect('scroll', this._scrollToButton.bind(this));
            button.connectBlockActivate(this._scrollBox);
        }
        if (!button.get_parent()) {
            if (this.grid) {
                this.grid.add_item(button);
            } else {
                this._appsBox.add_child(button);
            }
        }
    }

    // Clear the apps box
    _clear() {
        if (this.grid) {
            this.grid.clear();
        } else {
            this._appsBox.remove_all_children();
        }
    }

    // Scroll to a specific button (menu item) in the apps scroll view
    _scrollToButton(button) {
        if (button) {
            let scrollBoxAdj = this._scrollBox.get_vscroll_bar().get_adjustment();
            let scrollBoxAlloc = this._scrollBox.get_allocation_box();
            let currentScrollValue = scrollBoxAdj.get_value();
            let boxHeight = scrollBoxAlloc.y2 - scrollBoxAlloc.y1;
            let buttonAlloc = button.get_allocation_box();
            let newScrollValue = currentScrollValue;
            if (currentScrollValue > buttonAlloc.y1 - 10)
                newScrollValue = buttonAlloc.y1 - 10;
            if (boxHeight + currentScrollValue < buttonAlloc.y2 + 10)
                newScrollValue = buttonAlloc.y2 - boxHeight + 10;
            if (newScrollValue != currentScrollValue)
                scrollBoxAdj.set_value(newScrollValue);
        }
    }

    selectCategory(category_menu_id) {
        if (category_menu_id) {
            this._category = category_menu_id;
            this._searchPattern = null;
            let apps = this._appsBackend.getAppsByCategory(this._category);
            this._clear();
            this._display(apps);
        }
    }

    searchApps(pattern) {
        if (pattern) {
            this._searchPattern = pattern;
            this._category = null;
            let apps = this._appsBackend.searchApps(this._searchPattern);
            this._clear();
            this._display(apps);
        }
    }
    
    displayAllApps() {
        this._searchPattern = null;
        this._category = null;
        let apps = this._appsBackend.getAllApps();
        this._clear();
        this._display(apps);
    }

    grab_key_focus() {
        let item = this._appsBox.get_first_child();
        if (item) {
            item.grab_key_focus();
        }
    }

    show() {
        super.show();
        this.grab_key_focus();
    }

    _onDestroy() {
        this._appsBackend.disconnect(this._reloadId);
        this._reloadId = 0;
        this._appButtons.clear();
        this._category = null;
        this._searchPattern = null;
    }
});
