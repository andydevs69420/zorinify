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
const Atk = imports.gi.Atk;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const GLib = imports.gi.GLib;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Widgets = Me.imports.widgets;
const Layouts = Me.imports.layouts;
const AppsBackend = Me.imports.appsbackend;
const Keybinder = Me.imports.keybinder;

const ALL_ANIMATIONS = ~0;
const DEFAULT_MENU_HEIGHT = 490;
const GRID_MENU_HEIGHT = 600;
const LAYOUTS = Layouts.layouts;
const INTELLIHIDE_TIMEOUT = 750;

// Application menu class

var ApplicationsMenu = class ApplicationsMenu extends PopupMenu.PopupMenu {
    // Initialize the menu
    constructor(sourceActor, arrowAlignment, arrowSide, settings) {
        super(sourceActor, arrowAlignment, arrowSide);
        this._intellihideTimeoutId = 0;
        this._section = new PopupMenu.PopupMenuSection();
        this.addMenuItem(this._section);
        this._settings = settings;
        this._appsBackend = new AppsBackend.AppsBackend();

        this._settingsId = this._settings.connect('changed::layout', () => {
            this._reloadLayout();
        });
        this.actor.connect('destroy', this._onDestroy.bind(this));
        this.actor.add_style_class_name('panel-menu');
        Main.uiGroup.add_actor(this.actor);
        this.actor.hide();
    }

    _loadLayout() {
        this._layout = Layouts.getLayout(this._settings, this._appsBackend);
        this._section.actor.add_child(this._layout.actor);
        this._layout.connect('activated', () => {
            this._onLayoutActivated();
        });
    }

    _reloadLayout() {
        this._layout.destroy();
        this._loadLayout();
    }

    _togglePanelIntellihide() {
        let panel = Main.panel.get_parent();
        if (panel && panel.intellihide && panel.intellihide.enabled && !panel.intellihide._panelBox.visible) {
            panel.intellihide._revealPanel(true);
        }
    }

    _panelIntellihideQueueUpdatePosition() {
        let panel = Main.panel.get_parent();
        if (panel && panel.intellihide && panel.intellihide.enabled && panel.intellihide._panelBox.visible) {
            panel.intellihide._queueUpdatePanelPosition();
        }
    }

    // Return that the menu is not empty (used by parent class)
    isEmpty() {
        return false;
    }

    // Handle opening the menu
    open(animate) {
        this._togglePanelIntellihide();
        super.open(animate);
        if (!this._layout) {
            this._loadLayout();
        }
        this._layout.reset();
        this._updateHeight();
    }

    _updateHeight() {
        let [minHeight, naturalHeight] = this._getPreferredHeight();
        this._layout.actor.set_height((minHeight > naturalHeight) ? minHeight : naturalHeight);
    }

    _getPreferredHeight() {
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let layoutSetting = this._settings.get_enum('layout');
            switch(layoutSetting) {
                case LAYOUTS.ALL:
                    let [, naturalHeight] = this._layout._rightBox.get_preferred_height(-1);
                    return [DEFAULT_MENU_HEIGHT, naturalHeight];
                case LAYOUTS.SYSTEM_ONLY:
                    return this._layout._box.get_preferred_height(-1);
                case LAYOUTS.APP_GRID:
                    let gridHeight = GRID_MENU_HEIGHT * scaleFactor;
                    let availableHeight = Main.layoutManager.primaryMonitor.height - (100 * scaleFactor);
                    if (gridHeight > availableHeight) {
                        return [availableHeight, availableHeight];
                    }
                    return [gridHeight, gridHeight];
                default:
                    let height = DEFAULT_MENU_HEIGHT * scaleFactor;
                    return [height, height];
        }
    }

    // Handle menu item activation
    _onLayoutActivated() {
        this.close(ALL_ANIMATIONS)
        if (Main.overview.visible)
            Main.overview.hide();
    }

    // Handle closing the menu
    close(animate) {
        super.close(animate);
        if (this._intellihideTimeoutId > 0) {
            GLib.source_remove(this._intellihideTimeoutId);
            this._intellihideTimeoutId = 0;
        }
        this._intellihideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, INTELLIHIDE_TIMEOUT, () => {
            this._intellihideTimeoutId = 0;
            this._panelIntellihideQueueUpdatePosition();
            return GLib.SOURCE_REMOVE;
        });
    }

    // Toggle menu open state
    toggle() {
        super.toggle();
    }

    _onDestroy() {
        this._appsBackend.destroy();
        this._settings.disconnect(this._settingsId);
    }
};

// Application Menu Button class
var ApplicationsButton = GObject.registerClass(
class ApplicationsButton extends PanelMenu.Button {
    // Initialize the menu
    _init(settings) {
        super._init(1.0, null, true);

        this._settings = settings
        this._menu = new ApplicationsMenu(this, 0.5, St.Side.TOP, this._settings);
        this._menu.connect('open-state-changed', this._onOpenStateChanged.bind(this));
        this.menuManager = new PopupMenu.PopupMenuManager(Main.panel);
        this.menuManager._changeMenu = (menu) => {};
        this.menuManager.addMenu(this._menu);
        this.accessible_role = Atk.Role.LABEL;
        this._menuButton = new Widgets.MenuButton(this._settings);
        this.add_child(this._menuButton);
        this.name = 'panelApplications';
        this._showingId = Main.overview.connect('showing', () => {
            this.add_accessible_state(Atk.StateType.CHECKED);
        });
        this._hidingId = Main.overview.connect('hiding', () => {
            this.remove_accessible_state(Atk.StateType.CHECKED);
        });
        this._menuKeybinder = new Keybinder.MenuKeybinder( () => {
            this._menu.toggle();
        });
        this._settings.connect('changed::super-hotkey', this._updateKeybinding.bind(this));
        this._updateKeybinding();
    }

    // Destroy the menu button
    _onDestroy() {
        if (this._menu)
            this._menu.destroy();
        super._onDestroy();
        if (this._showingId) {
            Main.overview.disconnect(this._showingId);
            this._showingId = null;
        }
        if (this._hidingId) {
            Main.overview.disconnect(this._hidingId);
            this._hidingId = null;
        }
        this._menuKeybinder.destroy();
    }

    _updateKeybinding() {
        let enableHotkey = this._settings.get_boolean('super-hotkey');
        if (enableHotkey) {
            this._menuKeybinder.enableHotKey();
        } else {
            this._menuKeybinder.disableHotKey();
        }
    }

    vfunc_event(event) {
        if (this._menu &&
            (event.type() == Clutter.EventType.TOUCH_BEGIN ||
             event.type() == Clutter.EventType.BUTTON_PRESS))
            this._menu.toggle();

        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_hide() {
        super.vfunc_hide();

        if (this._menu)
            this._menu.close();
    }


    _onOpenStateChanged(menu, open) {
        if (open) {
            this.add_style_pseudo_class('active');
            if(Main.panel.menuManager && Main.panel.menuManager.activeMenu)
                Main.panel.menuManager.activeMenu.toggle();
        } else {
            this.remove_style_pseudo_class('active');
        }

        // Setting the max-height won't do any good if the minimum height of the
        // menu is higher then the screen; it's useful if part of the menu is
        // scrollable so the minimum height is smaller than the natural height
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let verticalMargins = this._menu.actor.margin_top + this._menu.actor.margin_bottom;

        // The workarea and margin dimensions are in physical pixels, but CSS
        // measures are in logical pixels, so make sure to consider the scale
        // factor when computing max-height
        let maxHeight = Math.round((workArea.height - verticalMargins) / scaleFactor);
        this._menu.actor.style = 'max-height: %spx;'.format(maxHeight);
    }
});
