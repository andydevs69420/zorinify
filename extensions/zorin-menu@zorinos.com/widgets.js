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
 * This file contains code from the Applications Menu extension by easy2002
 * and Debarshi Ray, the Drive Menu extension by Giovanni Campagna, and
 * userWidget.js from Gnome Shell
 */

// Import Libraries
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Dash = imports.ui.dash;
const Main = imports.ui.main;
const BoxPointer = imports.ui.boxpointer;
const PopupMenu = imports.ui.popupMenu;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const Signals = imports.signals;
const AccountsService = imports.gi.AccountsService;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Util = imports.misc.util;
const ExtensionUtils = imports.misc.extensionUtils;
const ExtensionState = ExtensionUtils.ExtensionState;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;
const AppDisplay = imports.ui.appDisplay;
const Params = imports.misc.params;
const SecondaryMenu = Me.imports.secondaryMenu;
const Utils = Me.imports.utils;

const TOOLTIP_TIMEOUT = 500;
const APP_LIST_ICON_SIZE = 32;
const APP_GRID_ICON_SIZE = 48;

var TooltipLocation = {
    TOP_CENTERED: 0,
    BOTTOM_CENTERED: 1,
    BOTTOM: 2,
};

// Removing the default behaviour which selects a hovered item if the space key is pressed.
// This avoids issues when searching for an app with a space character in its name.
var BaseMenuItem = GObject.registerClass(
class BaseMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(params) {
        super._init(params);
        this._blockActivate = false;
        this._blockActivateId = 0;
        this.connect('destroy', this._onDestroy.bind(this));
    }

    connectBlockActivate(actor) {
        this._blockActivateActor = actor;
        this._blockActivateActor.connect('block-activate', this.blockActivate.bind(this));
    }

    blockActivate() {
        this._blockActivate = true;
    }

    unblockActivate() {
        this._blockActivate = false;
    }

    vfunc_button_press_event() {
        if (!this._activatable)
            return Clutter.EVENT_PROPAGATE;

        let event = Clutter.get_current_event();
        if (event.get_button() == 1) {
            this.pressed = true;
            this._blockActivate = false;
        } else if(event.get_button() == 3) {
            this.pressed = true;
        }
        this.add_style_pseudo_class('active');
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_button_release_event(){
        if (!this._activatable)
            return Clutter.EVENT_PROPAGATE;

        let event = Clutter.get_current_event();
        if(event.get_button() == 1 && !this._blockActivate && this.pressed){
            this.pressed = false;
            this.activate(event); 
            this.remove_style_pseudo_class('active');
        }
        if(event.get_button() == 3 && this.pressed){
            this.pressed = false;
            this.remove_style_pseudo_class('active');
        }
        return Clutter.EVENT_STOP;
    }

    vfunc_touch_event(event){
        if (!this._activatable)
            return Clutter.EVENT_PROPAGATE;

        if(event.type == Clutter.EventType.TOUCH_END && !this._blockActivate && this.pressed){
            this.remove_style_pseudo_class('active');
            this.activate(Clutter.get_current_event());
            this.pressed = false;
            return Clutter.EVENT_STOP;
        }
        else if(event.type == Clutter.EventType.TOUCH_BEGIN){
            this.pressed = true;
            this._blockActivate = false;
            this.add_style_pseudo_class('active');
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_key_press_event(keyEvent) {
        if (!this._activatable)
            return super.vfunc_key_press_event(keyEvent);

        let state = keyEvent.modifier_state;

        // If user has a modifier down (except shift, capslock and numlock) then don't handle the key press here
        state &= ~Clutter.ModifierType.LOCK_MASK;
        state &= ~Clutter.ModifierType.MOD2_MASK;
        state &= ~Clutter.ModifierType.SHIFT_MASK
        state &= Clutter.ModifierType.MODIFIER_MASK;

        if (state)
            return Clutter.EVENT_PROPAGATE;

        state = keyEvent.modifier_state; // reset state variable
        let symbol = keyEvent.keyval;

        // Handle context menu
        if (symbol == Clutter.KEY_Menu || (symbol == Clutter.KEY_F10 && (state & Clutter.ModifierType.SHIFT_MASK))) {
            this.emit('popup-menu');
            return Clutter.EVENT_STOP;
        }

        // If shift modifier is down and context menu shortcut was not activated handle keypress elsewhere
        if (state & Clutter.ModifierType.SHIFT_MASK) {
            return Clutter.EVENT_PROPAGATE;
        }

        // Handle menu item activation
        if (symbol == Clutter.KEY_KP_Enter || symbol == Clutter.KEY_Return) {
            this.activate(Clutter.get_current_event());
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onDestroy() {
        if (this._blockActivateId != 0) {
            this._blockActivateActor.disconnect(this._blockActivateId);
            this._blockActivateActor = null;
            this._blockActivateId = 0;
        }
    }
});


// Vertical Separator
var VerticalSeparator = class VerticalSeparator{
    constructor() {
        this.actor = new St.Widget({ style_class: 'popup-separator-menu-item vertical-separator',
                                     x_expand: true,
                                     x_align: Clutter.ActorAlign.CENTER });
    }
};


// A class representing a Tooltip.
var Tooltip = class Tooltip{
    constructor(sourceActor, title, description) {
        this.sourceActor = sourceActor;
        this.location = TooltipLocation.BOTTOM;
        let titleLabel, descriptionLabel;
        this.actor = new St.BoxLayout({ 
            vertical: true,
            style_class: 'dash-label',
            opacity: 0
        });
      
        if(title){
            titleLabel = new St.Label({
                text: title,
                style: description ? "font-weight: bold;" : null,
                y_align: Clutter.ActorAlign.CENTER
            });
            this.actor.add_child(titleLabel);
        }

        if(description){
            descriptionLabel = new St.Label({
                text: description,
                y_align: Clutter.ActorAlign.CENTER
            });
            this.actor.add_child(descriptionLabel);
        }

        global.stage.add_child(this.actor);

        this.actor.connect('destroy',()=>{
            if(this.destroyID){
                this.sourceActor.disconnect(this.destroyID);
                this.destroyID = null;
            }
            if(this.activeID){
                this.sourceActor.disconnect(this.activeID);
                this.activeID = null;
            }
            
            if(this.hoverID){
                this.sourceActor.disconnect(this.hoverID);
                this.hoverID = null;
            }
        })
        this.activeID = this.sourceActor.connect('notify::active', ()=> this.setActive(this.sourceActor.active));
        this.destroyID = this.sourceActor.connect('destroy',this.destroy.bind(this));
        this.hoverID = this.sourceActor.connect('notify::hover', this._onHover.bind(this));
    }

    setActive(active){
        if(!active)
            this.hide();
    }

    _onHover() {
        if(this.sourceActor.hover){
            this.tooltipShowingID = GLib.timeout_add(0, TOOLTIP_TIMEOUT, () => {
                this.show();
                this.tooltipShowingID = null;
                return GLib.SOURCE_REMOVE;
            });
        }
        else {
            this.hide();
            if(this.tooltipShowingID){
                GLib.source_remove(this.tooltipShowingID);
                this.tooltipShowingID = null;
            }
        }
    }

    show() {
        this.actor.opacity = 0;
        this.actor.show();

        let [stageX, stageY] = this.sourceActor.get_transformed_position();

        let itemWidth  = this.sourceActor.allocation.x2 - this.sourceActor.allocation.x1;
        let itemHeight = this.sourceActor.allocation.y2 - this.sourceActor.allocation.y1;

        let labelWidth = this.actor.get_width();
        let labelHeight = this.actor.get_height();

        let x, y;
        let gap = 5;

        switch (this.location) {
            case TooltipLocation.BOTTOM_CENTERED:
                y = stageY + itemHeight + gap;
                x = stageX + Math.floor((itemWidth - labelWidth) / 2);
                break;
            case TooltipLocation.TOP_CENTERED:
                y = stageY - labelHeight - gap;
                x = stageX + Math.floor((itemWidth - labelWidth) / 2);
                break;
            case TooltipLocation.BOTTOM:
                y = stageY + itemHeight;
                x = stageX + gap * 2;
                break;
        }

        // keep the label inside the screen          
        let monitor = Main.layoutManager.findMonitorForActor(this.sourceActor);
        if (x - monitor.x < gap)
            x += monitor.x - x + gap;
        else if (x + labelWidth > monitor.x + monitor.width - gap)
            x -= x + labelWidth - (monitor.x + monitor.width) + gap;
        else if (y - monitor.y < gap)
            y += monitor.y - y + gap;
        else if (y + labelHeight > monitor.y + monitor.height - gap)
            y -= y + labelHeight - (monitor.y + monitor.height) + gap;
        
        this.actor.set_position(x, y);
        this.actor.ease({
            opacity: 255,
            duration: Dash.DASH_ITEM_LABEL_SHOW_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    hide() {
        this.actor.ease({
            opacity: 0,
            duration: Dash.DASH_ITEM_LABEL_HIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this.actor.hide()
        });
    }

    destroy() {
        if (this.tooltipShowingID) {
            GLib.source_remove(this.tooltipShowingID);
            this.tooltipShowingID = null;
        }
        if(this.hoverID>0){
            this.sourceActor.disconnect(this.hoverID);
            this.hoverID = 0;
        }
        
        global.stage.remove_actor(this.actor);
        this.actor.destroy();
    }
};


// A base class for session buttons.
var SessionButton = GObject.registerClass({
    Signals: {
        'activated': {},
    },
}, class SessionButton extends St.Button {
    _init(systemActions, accessible_name, icon_name) {        
        super._init({
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: accessible_name ? accessible_name : "",
            style_class: "button system-menu-action"
        });
        
        this._systemActions = systemActions;
        this.needsDestroy = true;
        this.tooltip = new Tooltip(this, accessible_name);
        this.tooltip.location = TooltipLocation.TOP_CENTERED;
        this.tooltip.hide();
        this._icon = new St.Icon({ icon_name: icon_name });
        this.set_child(this._icon);
        this.connect('destroy', () => this.needsDestroy = false);
        // this.connect('key-press-event', this._onKeyPressEvent.bind(this)); TODO: Remove this function if pressing enter activates the button
    }

    get actor() {
        return this;
    }
    
    /*_onKeyPressEvent(actor, event) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.KEY_Return ||
            symbol == Clutter.KEY_KP_Enter) {
            this.activate();
            return Clutter.EVENT_STOP;
        } else if (symbol == Clutter.KEY_space ||
            symbol == Clutter.KEY_KP_Space) {
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    },*/

    vfunc_clicked(button) {       
        this.emit('activated');
        this.activate();
    }

    activate() {
        // Button specific action
    }
});

var PowerMenuButton = GObject.registerClass(class PowerMenuButton extends SessionButton {
    _init(systemActions) {
        super._init(systemActions, _("Power"), 'system-shutdown-symbolic');
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._createPowerMenu();

        this._suspendItem.connect('notify::visible',
            () => this._updateButtonReactivity());
        this._restartItem.connect('notify::visible',
            () => this._updateButtonReactivity());
        this._powerOffItem.connect('notify::visible',
            () => this._updateButtonReactivity());
        this._updateButtonReactivity()
    }

    _createPowerMenu(){
        this.powerMenu = new PopupMenu.PopupMenu(this, 0.5 , St.Side.BOTTOM);
        this.powerMenu.connect('open-state-changed', (menu, open) => {
            if(open){
                if(this.tooltip!=undefined) {
                    this.tooltip.hide();
                    if(this.tooltip.tooltipShowingID){
                        GLib.source_remove(this.tooltip.tooltipShowingID);
                        this.tooltip.tooltipShowingID = null;
                    }
                }
                this._systemActions.forceUpdate();
            }
        });

        let bindFlags = GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE;

        this._suspendItem = new PopupMenu.PopupImageMenuItem(_("Suspend"), 'media-playback-pause-symbolic');
        this._suspendItem.connect('activate', () => {
            this.powerMenu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this.emit('activated');
            this._systemActions.activateSuspend();
        });
        this.powerMenu.addMenuItem(this._suspendItem);
        this._systemActions.bind_property('can-suspend',
            this._suspendItem, 'visible',
            bindFlags
        );

        this._restartItem = new PopupMenu.PopupImageMenuItem(_("Restart…"), 'system-reboot-symbolic');
        this._restartItem.connect('activate', () => {
            this.powerMenu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this.emit('activated');
            this._systemActions.activateRestart();
        });
        this.powerMenu.addMenuItem(this._restartItem);
        this._systemActions.bind_property('can-restart',
            this._restartItem, 'visible',
            bindFlags
        );

        this._powerOffItem = new PopupMenu.PopupImageMenuItem(_("Power Off…"), 'system-shutdown-symbolic');
        this._powerOffItem.connect('activate', () => {
            this.powerMenu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this.emit('activated');
            this._systemActions.activatePowerOff();
        });
        this.powerMenu.addMenuItem(this._powerOffItem);
        this._systemActions.bind_property('can-power-off',
            this._powerOffItem, 'visible',
            bindFlags
        );

        this._menuManager.addMenu(this.powerMenu);
        this.powerMenu.actor.hide();
        Main.uiGroup.add_actor(this.powerMenu.actor);
    }

    _updateButtonReactivity() {
        this.reactive =
            this._suspendItem.visible ||
            this._restartItem.visible ||
            this._powerOffItem.visible;
    }

    vfunc_clicked(button) {
        this.activate();
    }
    
    activate() {
        this.powerMenu.toggle();
    }
});


var PowerButton = GObject.registerClass(class PowerButton extends SessionButton {
    _init(systemActions) {
        super._init(systemActions, _("Power Off"), 'system-shutdown-symbolic');

        let bindFlags = GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE;
        this._systemActions.bind_property('can-power-off',
            this, 'reactive',
            bindFlags
        );
    }
    
    activate() {
        this._systemActions.activatePowerOff();
    }
});


var RestartButton = GObject.registerClass(class RestartButton extends SessionButton {
    _init(systemActions) {
        super._init(systemActions, _("Restart"), 'system-reboot-symbolic');

        let bindFlags = GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE;
        this._systemActions.bind_property('can-restart',
            this, 'visible',
            bindFlags
        );
    }
    
    activate() {
        this._systemActions.activateRestart();
    }
});


var SuspendButton = GObject.registerClass(class SuspendButton extends SessionButton {
    _init(systemActions) {
        super._init(systemActions, _("Suspend"), 'media-playback-pause-symbolic');

        let bindFlags = GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE;
        this._systemActions.bind_property('can-suspend',
            this, 'visible',
            bindFlags
        );
    }
    
    activate() {
        this._systemActions.activateSuspend();
    }
});


var LogoutButton = GObject.registerClass(class LogoutButton extends SessionButton {
    _init(systemActions) {
        super._init(systemActions, _("Log Out"), 'application-exit-symbolic');

        let bindFlags = GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE;
        this._systemActions.bind_property('can-logout',
            this, 'visible',
            bindFlags
        );
    }
    
    activate() {
        this._systemActions.activateLogout();
    }
});


var LockButton = GObject.registerClass(class LockButton extends SessionButton {
    _init(systemActions) {
        super._init(systemActions, _("Lock"), 'changes-prevent-symbolic');
        
        let bindFlags = GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE;
        this._systemActions.bind_property('can-lock-screen',
            this, 'visible',
            bindFlags
        );
    }
    
    activate() {
        this._systemActions.activateLockScreen();
    }
});


// Menu item to go back to category view
var BackMenuItem = GObject.registerClass({
    Signals: {
        'activated': {},
    },
}, class BackMenuItem extends BaseMenuItem {
    _init() {
        super._init();
        this._icon = new St.Icon({
            icon_name: 'go-previous-symbolic',
            style_class: 'popup-menu-icon',
            icon_size: APP_LIST_ICON_SIZE
        });
        this.add_child(this._icon);
        let backLabel = new St.Label({
            text: _("Back"),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(backLabel);
    }
    
    // Activate the button (go back to category view)
    activate(event) {
        this.emit('activated');
    }
});


// Menu shortcut item class
var ShortcutMenuItem = GObject.registerClass({
    Signals: {
        'activated': {},
    },
}, class ShortcutMenuItem extends BaseMenuItem {
    // Initialize the menu item
    _init(name, command, icon, fallbackIcon) {
        super._init();
        this._command = command;
        this._icon = new St.Icon({
            icon_name: icon,
            style_class: 'popup-menu-icon',
            icon_size: 16
        });
        if (fallbackIcon && (typeof fallbackIcon == 'string' || fallbackIcon instanceof String))
            this._icon.set_fallback_icon_name(fallbackIcon);
        this.add_child(this._icon);
        let label = new St.Label({
            text: name, y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(label);
    }

    // Activate the menu item (Launch the shortcut)
    activate(event) {
        this.emit('activated');
        Util.spawnCommandLine(this._command);
    }
});


// Avatar class used in the User Menu Item
var Avatar = GObject.registerClass(
class Avatar extends St.Bin {

    _init(user, params) {
        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        params = Params.parse(params, {
            reactive: false,
            iconSize: APP_LIST_ICON_SIZE,
            styleClass: 'menu-user-avatar'
        });
        
        this._iconSize = params.iconSize;

        super._init({
            style_class: params.styleClass,
            reactive: params.reactive,
            width: this._iconSize * themeContext.scaleFactor,
            height: this._iconSize * themeContext.scaleFactor
        });

        this._user = user;
        
        this.bind_property('reactive', this, 'track-hover',
            GObject.BindingFlags.SYNC_CREATE);
        this.bind_property('reactive', this, 'can-focus',
            GObject.BindingFlags.SYNC_CREATE);

        // Monitor the scaling factor to make sure we recreate the avatar when needed.
        this._scaleFactorChangeId =
            themeContext.connect('notify::scale-factor', this.update.bind(this));

        this.connect('destroy', this._onDestroy.bind(this));
    }
    
    
    vfunc_style_changed() {
        super.vfunc_style_changed();

        let node = this.get_theme_node();
        let [found, iconSize] = node.lookup_length('icon-size', false);

        if (!found)
            return;

        let themeContext = St.ThemeContext.get_for_stage(global.stage);

        // node.lookup_length() returns a scaled value, but we
        // need unscaled
        this._iconSize = iconSize / themeContext.scaleFactor;
        this.update();
    }
    
    _onDestroy() {
        if (this._scaleFactorChangeId) {
            let themeContext = St.ThemeContext.get_for_stage(global.stage);
            themeContext.disconnect(this._scaleFactorChangeId);
            delete this._scaleFactorChangeId;
        }
    }

    update() {
        let iconFile = null;
        if (this._user) {
            iconFile = this._user.get_icon_file();
            if (iconFile && !GLib.file_test(iconFile, GLib.FileTest.EXISTS))
                iconFile = null;
        }

        let { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        this.set_size(
            this._iconSize * scaleFactor,
            this._iconSize * scaleFactor);

        if (iconFile) {
            this.child = null;
            this.add_style_class_name('user-avatar');
            this.style = `
                background-image: url("${iconFile}");
                background-size: cover;`;
        } else {
            this.style = null;
            this.child = new St.Icon({
                icon_name: 'avatar-default-symbolic',
                icon_size: this._iconSize,
            });
        }
    }
});


// Menu item which displays the current user  
var UserMenuItem = GObject.registerClass({
    Signals: {
        'activated': {},
    },
}, class UserMenuItem extends BaseMenuItem {
    // Initialize the menu item
    _init() {
        super._init();
        let username = GLib.get_user_name();
        this._user = AccountsService.UserManager.get_default().get_user(username);
        this._avatar = new Avatar(this._user);
        this.add_child(this._avatar);
        this._userLabel = new St.Label({
            text: username,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this.add_style_class_name('user-menu-item');
        this.add_child(this._userLabel);
        this.label_actor = this._userLabel;
        this.tooltip = new Tooltip(this, username);
        this.tooltip.location = TooltipLocation.BOTTOM_CENTERED;
        this.tooltip.hide();
        this._userLoadedId = this._user.connect('notify::is-loaded', this._onUserChanged.bind(this));
        this._userChangedId = this._user.connect('changed', this._onUserChanged.bind(this));
        this.connect('destroy', this._onDestroy.bind(this));
        this._onUserChanged();
    }

    // Activate the menu item (Open user account settings)
    activate(event) {
        this.emit('activated');
        Util.spawnCommandLine("gnome-control-center user-accounts");
    }

    // Handle changes to user information (redisplay new info)
    _onUserChanged() {
        if (this._user.is_loaded) {
            this._userLabel.set_text(this._user.get_real_name());
            this._avatar.update();
        }
    }

    // Destroy the menu item
    _onDestroy() {
        if (this._userLoadedId != 0) {
            this._user.disconnect(this._userLoadedId);
            this._userLoadedId = 0;
        }
        if (this._userChangedId != 0) {
            this._user.disconnect(this._userChangedId);
            this._userChangedId = 0;
        }
    }
});

var UserMenuButton = GObject.registerClass(class UserMenuButton extends UserMenuItem {
    _init(systemActions) {
        super._init();
        this.tooltip.location = TooltipLocation.TOP_CENTERED;
        this._systemActions = systemActions;
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._createUserMenu();

        this._lockItem.connect('notify::visible',
            () => this._updateSeparatorVisibility());
        this._switchUserItem.connect('notify::visible',
            () => this._updateSeparatorVisibility());
        this._logoutItem.connect('notify::visible',
            () => this._updateSeparatorVisibility());
        this._updateSeparatorVisibility()
    }

    _createUserMenu(){
        this.userMenu = new PopupMenu.PopupMenu(this, 0.5 , St.Side.BOTTOM);
        this.userMenu.connect('open-state-changed', (menu, open) => {
            if(open){
                if(this.tooltip!=undefined) {
                    this.tooltip.hide();
                    if(this.tooltip.tooltipShowingID){
                        GLib.source_remove(this.tooltip.tooltipShowingID);
                        this.tooltip.tooltipShowingID = null;
                    }
                }
                this._systemActions.forceUpdate();
            }
        });

        let bindFlags = GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE;

        this._accountSettingsItem = new PopupMenu.PopupImageMenuItem(_("Account Settings"), 'avatar-default-symbolic');
        this._accountSettingsItem.connect('activate', () => {
            this.userMenu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this.emit('activated');
            Util.spawnCommandLine("gnome-control-center user-accounts");
        });
        this.userMenu.addMenuItem(this._accountSettingsItem);

	this._separatorItem = new PopupMenu.PopupSeparatorMenuItem();
        this.userMenu.addMenuItem(this._separatorItem);

        this._lockItem = new PopupMenu.PopupImageMenuItem(_("Lock"), 'changes-prevent-symbolic');
        this._lockItem.connect('activate', () => {
            this.userMenu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this.emit('activated');
            this._systemActions.activateLockScreen();
        });
        this.userMenu.addMenuItem(this._lockItem);
        this._systemActions.bind_property('can-lock-screen',
            this._lockItem, 'visible',
            bindFlags
        );

        this._switchUserItem = new PopupMenu.PopupImageMenuItem(_("Switch User…"), 'system-switch-user-symbolic');
        this._switchUserItem.connect('activate', () => {
            this.userMenu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this.emit('activated');
            this._systemActions.activateSwitchUser();
        });
        this.userMenu.addMenuItem(this._switchUserItem);
        this._systemActions.bind_property('can-switch-user',
            this._switchUserItem, 'visible',
            bindFlags
        );

        this._logoutItem = new PopupMenu.PopupImageMenuItem(_("Log Out"), 'application-exit-symbolic');
        this._logoutItem.connect('activate', () => {
            this.userMenu.itemActivated(BoxPointer.PopupAnimation.NONE);
            this.emit('activated');
            this._systemActions.activateLogout();
        });
        this.userMenu.addMenuItem(this._logoutItem);
        this._systemActions.bind_property('can-logout',
            this._logoutItem, 'visible',
            bindFlags
        );

        this._menuManager.addMenu(this.userMenu);
        this.userMenu.actor.hide();
        Main.uiGroup.add_actor(this.userMenu.actor);
    }

    _updateSeparatorVisibility() {
        this._separatorItem.visible =
            this._lockItem.visible ||
            this._switchUserItem.visible ||
            this._logoutItem.visible;
    }

    activate() {
        this.userMenu.toggle();
    }
});

// Menu application item class
var AppMenuItem = GObject.registerClass({
    Signals: {
        'activated': {},
        'scroll': { param_types: [GObject.TYPE_OBJECT] },
        'menu-state-changed': { param_types: [GObject.TYPE_BOOLEAN] }
    },
}, class AppMenuItem extends BaseMenuItem {
    // Initialize menu item
    _init(app, isGrid) {
        super._init();
        this._iconSize = APP_LIST_ICON_SIZE;
        this.app = app;
        this._iconBin = new St.Bin();
        this.add_child(this._iconBin);
        this.actor.add_style_class_name("app-item");

        let appLabel = new St.Label({
            text: app.get_name(),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(appLabel);
        this.label_actor = appLabel;

        let textureCache = St.TextureCache.get_default();
        let iconThemeChangedId = textureCache.connect('icon-theme-changed', this._updateIcon.bind(this));
        this.connect('destroy', () => {
                this._removeMenuTimeout();
                textureCache.disconnect(iconThemeChangedId);
        });
        this.connect('popup-menu', this._onKeyboardPopupMenu.bind(this));
        this._updateIcon();
        this._menu = null;
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._menuTimeoutId = 0;
        
        this.connect('notify::hover', this._onHover.bind(this));
        if (isGrid) {
            this._setGrid();
        }
    }
    
    _setGrid() {
        this._iconBin.x_align = Clutter.ActorAlign.CENTER;
        this._iconBin.y_align = Clutter.ActorAlign.START;
        this._iconBin.y_expand = false;
        this.label_actor.x_align = Clutter.ActorAlign.CENTER;
        this.label_actor.y_align = Clutter.ActorAlign.START;
        this.label_actor.y_expand = false;
        this.label_actor.get_clutter_text().set_line_wrap(true);
        this.vertical = true;
        this._iconSize = APP_GRID_ICON_SIZE;
        this._updateIcon();
        this.remove_child(this._ornamentLabel);
    }
    
    _onHover() {
        if(this.tooltip==undefined && this.hover && this.label_actor){
            this._createTooltip();
        }
    }
    
    _createTooltip(){
        let description = this.app.get_description();
        let lbl = this.label_actor.clutter_text;
        lbl.get_allocation_box();
        let isEllipsized = lbl.get_layout().is_ellipsized();
        if(isEllipsized || description){
            let titleText, descriptionText;
            if(isEllipsized && description){
                titleText = this.label_actor.text.replace(/\n/g, " ");
                descriptionText = description;
            }
            else if(isEllipsized && !description)
                titleText = this.label_actor.text.replace(/\n/g, " ");
            else if(!isEllipsized && description)
                descriptionText = description;
            this.tooltip = new Tooltip(this, titleText, descriptionText);
            this.tooltip._onHover(); // Hides the tooltip
        } 
    }

    get_app_id() {
        return this.app.get_id();
    }

    // Activate menu item (Launch application)
    activate(event) {
        this.app.open_new_window(-1);
        this.emit('activated');
        super.activate(event);
    }

    get active() {
        return super.active
    }

    // Set button as active, scroll to the button
    set active(active) {
        if (active && !this.hover) {
            this.emit('scroll', this);
        }
        super.active = active;
    }

    // Update the app icon in the menu
    _updateIcon() {
        this._iconBin.set_child(this.app.create_icon_texture(this._iconSize));
    }

    _removeMenuTimeout() {
        if (this._menuTimeoutId > 0) {
            GLib.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    }

    _setPopupTimeout() {
        this._removeMenuTimeout();
        this._menuTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, AppDisplay.MENU_POPUP_TIMEOUT, () => {
            this.pressed = false;
            this._menuTimeoutId = 0;
            if (!this._blockActivate) {
                this.popupMenu();
                this._menuManager.ignoreRelease();
            }
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._menuTimeoutId, '[gnome-shell] this.popupMenu');
    }

    popupMenu() {
        this._removeMenuTimeout();
            
        if(this.tooltip!=undefined) {
            this.tooltip.hide();
            if(this.tooltip.tooltipShowingID){
                GLib.source_remove(this.tooltip.tooltipShowingID);
                this.tooltip.tooltipShowingID = null;
            }
        }

        if (!this._menu) {
            this._menu = new SecondaryMenu.AppItemMenu(this);
            this._menu.connect('activate-window', (menu, window) => {
                menu.close();
                this.activateWindow(window);
            });
            this._menu.connect('open-state-changed', (menu, isPoppedUp) => {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            });
            let id = Main.overview.connect('hiding', () => { this._menu.close(); });
            this.connect('destroy', () => {
                Main.overview.disconnect(id);
            });

            this._menuManager.addMenu(this._menu);
        }

        this.emit('menu-state-changed', true);

        this.set_hover(true);
        this._menu.popup();

        return false;
    }

    activateWindow(metaWindow) {
        if (metaWindow) {
            Main.activateWindow(metaWindow);
        } else {
            Main.overview.hide();
        }
        this.emit('activated');
    }

    animateLaunch() {
        // Do nothing, function is only called by secondary menu (inherited from AppDisplay > AppIconMenu)
    }

    _onMenuPoppedDown() {
        this.sync_hover();
        this.emit('menu-state-changed', false);
    }

    _onKeyboardPopupMenu() {
        this.popupMenu();
        this._menu.actor.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
    }

    vfunc_leave_event(crossingEvent) {
        const ret = super.vfunc_leave_event(crossingEvent);

        this._removeMenuTimeout();
        return ret;
    }

    vfunc_button_press_event(buttonEvent) {
        const ret = super.vfunc_button_press_event(buttonEvent);
        if (buttonEvent.button == 1) {
            this._setPopupTimeout();
        }
        return ret;
    }

    vfunc_button_release_event(buttonEvent){
        this._removeMenuTimeout();

        if (!this._activatable)
            return Clutter.EVENT_PROPAGATE;

        let event = Clutter.get_current_event();
        if(event.get_button() == 3 && this.pressed){
            this.popupMenu();
        }
        let ret = super.vfunc_button_release_event();
        return Clutter.EVENT_STOP;
    }

    vfunc_touch_event(touchEvent) {
        const ret = super.vfunc_touch_event(touchEvent);
        if (touchEvent.type == Clutter.EventType.TOUCH_BEGIN) {
            this._setPopupTimeout();
        }
        return ret;
    }
});


// Menu Category item class
var CategoryMenuItem = GObject.registerClass({
    Signals: {
        'selected': { param_types: [GObject.TYPE_STRING] },
        'scroll': { param_types: [GObject.TYPE_OBJECT] }
    },
}, class CategoryMenuItem extends BaseMenuItem {
    // Initialize menu item
    _init(category) {
        super._init();
        this._category = category;
        let name;
        if (this._category) {
            name = this._category.get_name();
        } else {
            name = _("Favorites");
        }
        this._icon = new St.Icon({
            gicon: this._category.get_icon(),
            style_class: 'popup-menu-icon',
            icon_size: APP_LIST_ICON_SIZE
        });
        this.add_child(this._icon);
        let categoryLabel = new St.Label({
            text: name,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(categoryLabel);
        this.label_actor = categoryLabel;
        this._arrowIcon = new St.Icon({
            icon_name: 'go-next-symbolic',
            style_class: 'popup-menu-icon',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            icon_size: 12,
            opacity: 128
        });
        this.add_child(this._arrowIcon);
    }

    // Activate menu item (Display applications in category)
    activate(event) {
        this.emit('selected', this._category.get_menu_id());
        super.activate(event);
    }

    get active() {
        return super.active
    }

    // Set button as active, scroll to the button
    set active(active) {
        if (active && !this.hover) {
            this.emit('scroll', this);
        }
        super.active = active;
    }
});

// Place Info class
var PlaceInfo = class PlaceInfo {
    // Initialize place info
    constructor(file, name, icon) {
        this.file = file;
        this.name = name ? name : this._getFileName();
        this.icon = icon ? new Gio.ThemedIcon({ name: icon }) : this.getIcon();
    }

    // Launch place with appropriate application
    launch(timestamp) {
        let launchContext = global.create_app_launch_context(timestamp, -1);
        Gio.AppInfo.launch_default_for_uri(this.file.get_uri(), launchContext);
    }

    // Get Icon for place
    getIcon() {
        try {
            let info = this.file.query_info('standard::symbolic-icon', 0, null);
            return info.get_symbolic_icon();
        } catch(e) {
            if (e instanceof Gio.IOErrorEnum) {
                if (!this.file.is_native()) {
                    return new Gio.ThemedIcon({ name: 'folder-remote-symbolic' });
                } else {
                    return new Gio.ThemedIcon({ name: 'folder-symbolic' });
                }
            }
            throw e;
        }
    }

    // Get display name for place
    _getFileName() {
        try {
            let info = this.file.query_info('standard::display-name', 0, null);
            return info.get_display_name();
        } catch(e) {
            if (e instanceof Gio.IOErrorEnum) {
                return this.file.get_basename();
            }
            throw e;
        }
    }
};
Signals.addSignalMethods(PlaceInfo.prototype);

// Menu Place Shortcut item class
var PlaceMenuItem = GObject.registerClass({
    Signals: {
        'activated': {}
    },
}, class PlaceMenuItem extends BaseMenuItem {
    // Initialize menu item
    _init(info) {
        super._init();
        this._info = info;
        this._icon = new St.Icon({
            gicon: info.icon,
            icon_size: 16
        });
        this.add_child(this._icon);
        this._label = new St.Label({
            text: info.name,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER
        });
        this.add_child(this._label);
        this._changedId = this._info.connect('changed', this._propertiesChanged.bind(this));
        this.connect('destroy', this._onDestroy.bind(this));
    }

    // Destroy menu item
    _onDestroy() {
        if (this._changedId) {
            this._info.disconnect(this._changedId);
            this._changedId = 0;
        }
    }

    // Activate (launch) the shortcut
    activate(event) {
        this._info.launch(event.get_time());
        this.emit('activated');
        super.activate(event);
    }

    // Handle changes in place info (redisplay new info)
    _propertiesChanged(info) {
        this._icon.gicon = info.icon;
        this._label.text = info.name;
    }
});

// Search Entry class
var SearchEntry = GObject.registerClass({
    Signals: {
        'cleared': {},
        'search': {param_types: [GObject.TYPE_STRING]},
    },
}, class SearchEntry extends St.BoxLayout {
    _init() {
        super._init({
            x_expand: true,
            style_class: 'search-box'
        });
        this._entry = new St.Entry({
            name: 'search-entry',
            hint_text: _("Type to search…"),
            track_hover: true,
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.START
        });
        this._searchIcon = new St.Icon({
            style_class: 'search-entry-icon',
            icon_name: 'edit-find-symbolic',
            icon_size: 16
        });
        this._clearIcon = new St.Icon({
            style_class: 'search-entry-icon',
            icon_name: 'edit-clear-symbolic',
            icon_size: 16
        });
        this._entry.set_primary_icon(this._searchIcon);
        this.add_child(this._entry);
        this._entry.connect('secondary-icon-clicked', this.clear.bind(this));
        this._previousInput = '';
        this._previousPattern = '';

        this._text = this._entry.get_clutter_text();
        this._text.connect('text-changed', this._onTextChanged.bind(this));
    }

    getText() {
        return this._entry.get_text();
    }

    setText(text) {
        this._entry.set_text(text);
    }

    has_key_focus() {
        return this._entry.contains(global.stage.get_key_focus());
    }

    // Grab the key focus
    grab_key_focus() {
        this._entry.grab_key_focus();
    }

    // Clear the search box
    clear() {
        this._entry.set_text('');
        this._previousInput = '';
        this._previousPattern = '';
        this.grab_key_focus();
        this.emit('cleared');
    }

    _setClearIcon() {
       this._entry.set_secondary_icon(this._clearIcon);
    }

    _unsetClearIcon() {
        this._entry.set_secondary_icon(null);
    }

    // Handle search text entry input changes
    _onTextChanged() {
        let entryText = this._entry.get_text();
        if (entryText != '') {
            this._setClearIcon();
            let pattern = entryText.replace(/^\s+/g, '').replace(/\s+$/g, '').toLowerCase();
            if (pattern != this._previousPattern && pattern.length > 0) {
                this.emit('search', pattern);
            }
            this._previousInput = entryText;
            this._previousPattern = pattern;
        } else {
            this._unsetClearIcon();
            this._previousPattern = '';
            if (this._previousInput != '') {
                this._previousInput = '';
                this.emit('cleared');
            }
        }
    }
});

var Grid = GObject.registerClass(class Grid extends St.Widget {
    _init(column_count, column_spacing, row_spacing) {
        this._column_count = column_count;
        let layout = new Clutter.GridLayout({ 
            orientation: Clutter.Orientation.VERTICAL,
            column_spacing: column_spacing,
            row_spacing: row_spacing
        });
        super._init({ 
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            layout_manager: layout,
            style_class: 'apps-grid'
        });
        layout.hookup_style(this);
    }

    add_item(item) {
        let position = this.get_n_children();
        let row = Math.trunc(position / this._column_count);
        let col = position % this._column_count;
        if (this.get_text_direction() == Clutter.TextDirection.RTL) {
            col = (this._column_count - 1) - col;
        }
        this.layout_manager.attach(item, col, row, 1, 1);
    }
    
    grab_key_focus() {
        let col = 0;
        if (this.get_text_direction() == Clutter.TextDirection.RTL) {
            col = this._column_count - 1;
        }
        let item = this.layout_manager.get_child_at(col, 0);
        if (item) {
            item.grab_key_focus();
        }
    }
    
    clear() {
         this.remove_all_children();
    }
});

var ScrollView = GObject.registerClass({
    Signals: {
        'block-activate': {},
    },
}, class ScrollView extends St.ScrollView {
    _init(params){
        super._init(params);
        
        let panAction = new Clutter.PanAction({ interpolate: false });
        panAction.connect('pan', (action) => {
            this.emit('block-activate');
            this.onPan(action);
        });
        panAction.connect('gesture-cancel',(action) => this.onPanEnd(action));
        panAction.connect('gesture-end', (action) => this.onPanEnd(action));
        this.add_action(panAction);
    }
    
    onPan(action) {
        let [dist_, dx_, dy] = action.get_motion_delta(0);
        let adjustment = this.get_vscroll_bar().get_adjustment();
        adjustment.value -=  dy;
        return false;
    }
    
    onPanEnd(action) {
        let velocity = -action.get_velocity(0)[2];
        let adjustment = this.get_vscroll_bar().get_adjustment();
        let endPanValue = adjustment.value + velocity * 2;
        adjustment.value = endPanValue;
    }
});

// Menu Button icon
const ZORIN_ICON = Me.path + '/zorin-icon-symbolic.svg';
const APP_GRID_ICON = Me.path + '/app-grid-symbolic.svg';

// Menu Button padding variable
const MINIMUM_PADDING = 4;

// Base Menu Button Icon Sizes
const menuButtonIconSizes = [ 16, 24, 32, 48, 64, 96, 128 ];

const ZORIN_PANEL_UUID = 'zorin-taskbar@zorinos.com';
const ZORIN_PANEL_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.zorin-taskbar';

// Menu Button Widget
var MenuButton = GObject.registerClass(
class MenuButton extends St.BoxLayout {
    _init(settings) {
        super._init({
            style_class: 'panel-status-menu-box',
            pack_start: false
        });

        this._settings = settings;
        this._menu_icon = this._settings.get_boolean('logo-icon') ? ZORIN_ICON : APP_GRID_ICON;

        this._iconSize = 32;
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(this._menu_icon),
            icon_size: this._iconSize,
            style_class: 'popup-menu-icon'
        });
        this.add_child(this._icon);

        this._extensionChangedId = Main.extensionManager.connect('extension-state-changed', (data, extension) => {
            if (extension.uuid === ZORIN_PANEL_UUID && extension.state === ExtensionState.ENABLED) {
                this._connectToZorinPanel();
            }
            if (extension.uuid === ZORIN_PANEL_UUID && extension.state === ExtensionState.DISABLED) {
                this._disconnectFromZorinPanel();
            }  
        });
        this.connect('destroy', this._onDestroy.bind(this));

        this._zorinPanel = Main.extensionManager.lookup(ZORIN_PANEL_UUID);
        if (this._zorinPanel && this._zorinPanel.stateObj && this._zorinPanel.state === ExtensionState.ENABLED) {
            this._connectToZorinPanel();
        } else {
            this._disconnectFromZorinPanel();
        }
    }

    _connectToZorinPanel() {
        // Disconnect from Main.panel
        if(this._notifyHeightId){
            Main.panel.disconnect(this._notifyHeightId);
            this._notifyHeightId = null;
        }

        // Connect to Zorin Panel
        this._zorinPanel = Main.extensionManager.lookup(ZORIN_PANEL_UUID);      
        this._zorinPanelSettings = Utils.getSettingsForExtension(this._zorinPanel, ZORIN_PANEL_SETTINGS_SCHEMA);
        this._zorinPanelSizeChangedId = this._zorinPanelSettings.connect('changed::panel-size', this._adjustIconSize.bind(this));
        this._adjustIconSize();
    }

    _disconnectFromZorinPanel() {
        // Disconnect from Zorin Panel
        this._zorinPanel = null;
        if(this._zorinPanelSizeChangedId && this._zorinPanelSettings){
            this._zorinPanelSettings.disconnect(this._zorinPanelSizeChangedId);
            this._zorinPanelSizeChangedId = null;
        }
        this._zorinPanelSettings = null;

        // Connect to Main.panel
        this._notifyHeightId = Main.panel.connect('notify::height', this._adjustIconSize.bind(this));
        this._adjustIconSize();
    }

    _getPanelSize() {
        if (this._zorinPanel && this._zorinPanel.stateObj && this._zorinPanel.state === ExtensionState.ENABLED && this._zorinPanelSettings) {
            return this._zorinPanelSettings.get_int('panel-size');
        } else {
            let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            return Main.panel.get_height() / scaleFactor;
        }
    }

    _adjustIconSize() {
        let availSize = this._getPanelSize() - (MINIMUM_PADDING * 2);

        let newIconSize = menuButtonIconSizes[0];
        for (let i = 0; i < menuButtonIconSizes.length ; i++) {
            if (menuButtonIconSizes[i] < availSize) {
                newIconSize = menuButtonIconSizes[i];
            }
        }

        if (newIconSize == this._iconSize)
            return;

        this._iconSize = newIconSize;
        this._icon.set_icon_size(this._iconSize);
    }

    _onDestroy() {
        if(this._extensionChangedId){
            Main.extensionManager.disconnect(this._extensionChangedId);
            this._extensionChangedId = null;
        }
        if(this._notifyHeightId){
            Main.panel.disconnect(this._notifyHeightId);
            this._notifyHeightId = null;
        }
        if(this._zorinPanelSizeChangedId && this._zorinPanelSettings){
            this._zorinPanelSettings.disconnect(this._zorinPanelSizeChangedId);
            this._zorinPanelSizeChangedId = null;
        }
        this._zorinPanelSettings = null;
    }
});
