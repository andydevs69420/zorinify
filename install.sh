#!/bin/bash


if [[ $(whoami) != 'root' ]];
 then
	echo 'Please run as root'
	exit
fi

# begin
cp -r ./theme/Zorin* /usr/share/themes/
cp -r ./extensions/* /usr/share/gnome-shell/extensions/
cp -r ./icons/* /usr/share/icons/
cp -r ./fonts/truetype/* /usr/share/fonts/truetype/
cp -r ./fonts/opentype/* /usr/share/fonts/opentype/
apt install fonts-noto* -y
fc-cache -f -v
./enable.sh
echo 'Done!!'
echo "------------------------------------------"
echo "Please execute command: ./enable.sh"
