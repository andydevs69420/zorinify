#!/bin/bash

if [[ $(whoami) == 'root' ]];
 then
        echo 'Please run as regular user!'
        exit
fi


gsettings set org.gnome.desktop.interface gtk-theme ZorinBlue-Dark
gsettings set org.gnome.desktop.wm.preferences theme ZorinBlue-Dark
gnome-extensions enable zorin-appindicator@zorinos.com
gnome-extensions enable zorin-connect@zorinos.com
gnome-extensions enable zorin-desktop-icons@zorinos.com
gnome-extensions enable zorin-magic-lamp-effect@zorinos.com
gnome-extensions enable zorin-menu@zorinos.com
gnome-extensions enable zorin-printers@zorinos.com
gnome-extensions enable zorin-taskbar@zorinos.com
gnome-extensions enable zorin-window-move-effect@zorinos.com
