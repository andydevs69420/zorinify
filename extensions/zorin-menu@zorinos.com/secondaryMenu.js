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
 *
 * Credits:
 * This file is based on code from the quitfromdash extension by
 * Alex Palaistras
 */

const AppDisplay = imports.ui.appDisplay;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Utils = Me.imports.utils;

var AppItemMenu = class AppItemMenu extends AppDisplay.AppIconMenu {
    constructor(source) {
        super(source);
    }

    _rebuildMenu() {
        super._rebuildMenu();
        let app = this._source.app;
        if (!app)
            return;

        let desktop = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DESKTOP);
        let file = Gio.File.new_for_path(GLib.build_filenamev([desktop, app.get_id()]));
        if (!file.query_exists(null)){
            this._appendSeparator();
            this._addToDesktopItem = this._appendMenuItem(_("Add to Desktop"));
            this._addToDesktopItem.connect('activate', () => {
                Utils.addToDesktop(app.app_info);
            });
        }
    }

    // Override PopupMenu's onKeyPress function to prevent strange keypress handling behaviour of menu items
    _onKeyPress(actor, event) {
        // Disable toggling the menu by keyboard when it cannot be toggled by pointer
        if (!actor.reactive)
            return Clutter.EVENT_PROPAGATE;

        let state = event.get_state();

        // If user has a modifier down (except capslock and numlock) then don't handle the key press here
        state &= ~Clutter.ModifierType.LOCK_MASK;
        state &= ~Clutter.ModifierType.MOD2_MASK;
        state &= Clutter.ModifierType.MODIFIER_MASK;

        if (state)
            return Clutter.EVENT_PROPAGATE;

        let symbol = event.get_key_symbol();
        if (symbol == Clutter.KEY_Escape && this.isOpen) {
            this.close();
            return Clutter.EVENT_STOP;
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
    }
};
