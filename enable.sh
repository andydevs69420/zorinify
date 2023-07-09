#!/bin/bash

if [[ $(whoami) == 'root' ]];
 then
        echo 'Please run as regular user!'
        exit
fi



gnome-extensions enable zorin-appindicator@zorinos.com
gnome-extensions enable zorin-connect@zorinos.com
gnome-extensions enable zorin-desktop-icons@zorinos.com
gnome-extensions enable zorin-magic-lamp-effect@zorinos.com
gnome-extensions enable zorin-menu@zorinos.com
gnome-extensions enable zorin-printers@zorinos.com
gnome-extensions enable zorin-taskbar@zorinos.com
gnome-extensions enable zorin-window-move-effect@zorinos.com
