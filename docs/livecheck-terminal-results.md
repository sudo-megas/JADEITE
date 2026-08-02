[liveuser@CachyOS ~]$ ls /opt/JADEITE 2>&1
ls: cannot access '/opt/JADEITE': No such file or directory
[liveuser@CachyOS ~]$ which jadeite 2>&1
which: no jadeite in (/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/bin/site_perl:/usr/bin/vendor_perl:/usr/bin/core_perl)
[liveuser@CachyOS ~]$ mount | grep -iE 'ext4|btrfs|xfs'
[liveuser@CachyOS ~]$ ls -la /run/media/*/
total 0
drwxr-x---+ 2 root root 40 Jul 31 21:18 .
drwxr-xr-x  3 root root 60 Jul 31 21:15 ..
[liveuser@CachyOS ~]$ cd /home/liveuser/Documents/
[liveuser@CachyOS Documents]$ sha256sum jadeite-1.0.0.pacman
70e45bac46fff83951b85d374d4b51d780464872dd8136caafb5d7c16896828b  jadeite-1.0.0.pacman
[liveuser@CachyOS Documents]$ date +%s && sudo pacman -U ./jadeite-1.0.0.pacman
1785532854
warning: database file for 'cachyos' does not exist (use '-Sy' to download)
warning: database file for 'core' does not exist (use '-Sy' to download)
warning: database file for 'extra' does not exist (use '-Sy' to download)
warning: database file for 'multilib' does not exist (use '-Sy' to download)
loading packages...
resolving dependencies...
looking for conflicting packages...

Package (1)  New Version  Net Change

jadeite      1.0.0-1      318.10 MiB

Total Installed Size:  318.10 MiB

:: Proceed with installation? [Y/n] 
(1/1) checking keys in keyring                                     [------------------------------------] 100%
(1/1) checking package integrity                                   [------------------------------------] 100%
(1/1) loading package files                                        [------------------------------------] 100%
(1/1) checking for file conflicts                                  [------------------------------------] 100%
:: Processing package changes...
(1/1) installing jadeite                                           [------------------------------------] 100%
:: Running post-transaction hooks...
(1/3) Arming ConditionNeedsUpdate...
(2/3) Updating icon theme caches...
(3/3) Updating the desktop file MIME type cache...
[liveuser@CachyOS Documents]$ sudo pacman -Sy
:: Synchronizing package databases...
 cachyos                               517.3 KiB   489 KiB/s 00:01 [------------------------------------] 100%
 core                                  127.1 KiB  61.3 KiB/s 00:02 [------------------------------------] 100%
 extra                                   8.3 MiB  2.80 MiB/s 00:03 [------------------------------------] 100%
 multilib                              129.3 KiB  70.3 KiB/s 00:02 [------------------------------------] 100%
[liveuser@CachyOS Documents]$ date +%s && sudo pacman -U ./jadeite-1.0.0.pacman
1785532896
loading packages...
warning: jadeite-1.0.0-1 is up to date -- reinstalling
resolving dependencies...
looking for conflicting packages...

Package (1)  Old Version  New Version  Net Change

jadeite      1.0.0-1      1.0.0-1        0.00 MiB

Total Installed Size:  318.10 MiB
Net Upgrade Size:        0.00 MiB

:: Proceed with installation? [Y/n] 
(1/1) checking keys in keyring                                     [------------------------------------] 100%
(1/1) checking package integrity                                   [------------------------------------] 100%
(1/1) loading package files                                        [------------------------------------] 100%
(1/1) checking for file conflicts                                  [------------------------------------] 100%
:: Processing package changes...
(1/1) reinstalling jadeite                                         [------------------------------------] 100%
:: Running post-transaction hooks...
(1/3) Arming ConditionNeedsUpdate...
(2/3) Updating icon theme caches...
(3/3) Updating the desktop file MIME type cache...
[liveuser@CachyOS Documents]$ sudo pacman -S gtk3 nss alsa-lib
warning: gtk3-1:3.24.52-1 is up to date -- reinstalling
warning: alsa-lib-1.2.16.1-1 is up to date -- reinstalling
resolving dependencies...
looking for conflicting packages...

Package (3)     Old Version  New Version  Net Change  Download Size

extra/alsa-lib  1.2.16.1-1   1.2.16.1-1     0.00 MiB       0.52 MiB
extra/gtk3      1:3.24.52-1  1:3.24.52-1    0.00 MiB       8.83 MiB
core/nss        3.125-1      3.126-1        0.01 MiB       1.70 MiB

Total Download Size:   11.04 MiB
Total Installed Size:  59.97 MiB
Net Upgrade Size:       0.01 MiB

:: Proceed with installation? [Y/n] ^C
Interrupt signal received

[liveuser@CachyOS Documents]$ ls -l /usr/bin/jadeite
lrwxrwxrwx 1 root root 20 Jul 31 21:21 /usr/bin/jadeite -> /opt/JADEITE/jadeite
[liveuser@CachyOS Documents]$ ls -l /opt/JADEITE/chrome-sandbox
-rwxr-xr-x 1 root root 15232 Jul 31 20:33 /opt/JADEITE/chrome-sandbox
[liveuser@CachyOS Documents]$ unshare --user true; echo $?
0
[liveuser@CachyOS Documents]$ ls /usr/share/applications/jadeite.desktop
/usr/share/applications/jadeite.desktop
[liveuser@CachyOS Documents]$ ls /usr/share/applications/jadeite.desktop
/usr/share/applications/jadeite.desktop
[liveuser@CachyOS Documents]$ ls /usr/share/icons/hicolor/256x256/apps/jadeite.png
/usr/share/icons/hicolor/256x256/apps/jadeite.png
[liveuser@CachyOS Documents]$ jadeite
[cold-start] launch to lock screen: 770 ms
[3170:0731/212516.617881:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:277] Unable to set image transfer function.
[3170:0731/212516.617906:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:195] Failed to populate image description for color space {primaries:BT709, transfer:SRGB, matrix:RGB, range:FULL}
[3170:0731/212516.619704:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:277] Unable to set image transfer function.
[3170:0731/212516.619731:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:195] Failed to populate image description for color space {primaries:BT709, transfer:SRGB, matrix:RGB, range:FULL}
[3170:0731/212516.642585:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:277] Unable to set image transfer function.
[3170:0731/212516.642624:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:195] Failed to populate image description for color space {primaries:BT709, transfer:SRGB, matrix:RGB, range:FULL}
[3170:0731/212516.642643:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_management_surface.cc:64] Failed to get image description for color space.
^C[liveuser@CachyOS Documents]$ `date +%s` - jadeite
bash: 1785533212: command not found
[liveuser@CachyOS Documents]$ `date +%s`
bash: 1785533218: command not found
[liveuser@CachyOS Documents]$ date +%s
1785533223
[liveuser@CachyOS Documents]$ date +%s jadeite
date: extra operand ‘jadeite’
Try 'date --help' for more information.
[liveuser@CachyOS Documents]$ ^C

[liveuser@CachyOS Documents]$ date +%s
1785533310
[liveuser@CachyOS Documents]$ ^C
[liveuser@CachyOS Documents]$ date +%s
1785533357
[liveuser@CachyOS Documents]$ sudo pacman -U jadeite-1.0.0.pacman
loading packages...
warning: jadeite-1.0.0-1 is up to date -- reinstalling
resolving dependencies...
looking for conflicting packages...

Package (1)  Old Version  New Version  Net Change

jadeite      1.0.0-1      1.0.0-1        0.00 MiB

Total Installed Size:  318.10 MiB
Net Upgrade Size:        0.00 MiB

:: Proceed with installation? [Y/n] 
(1/1) checking keys in keyring                                     [------------------------------------] 100%
(1/1) checking package integrity                                   [------------------------------------] 100%
(1/1) loading package files                                        [------------------------------------] 100%
(1/1) checking for file conflicts                                  [------------------------------------] 100%
:: Processing package changes...
(1/1) reinstalling jadeite                                         [------------------------------------] 100%
:: Running post-transaction hooks...
(1/3) Arming ConditionNeedsUpdate...
(2/3) Updating icon theme caches...
(3/3) Updating the desktop file MIME type cache...
[liveuser@CachyOS Documents]$ jadeite
[3534:0731/212935.074329:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:277] Unable to set image transfer function.
[3534:0731/212935.074347:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:195] Failed to populate image description for color space {primaries:BT709, transfer:SRGB, matrix:RGB, range:FULL}
[cold-start] launch to lock screen: 704 ms
[3534:0731/212935.099727:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:277] Unable to set image transfer function.
[3534:0731/212935.099740:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:195] Failed to populate image description for color space {primaries:BT709, transfer:SRGB, matrix:RGB, range:FULL}
[3534:0731/212935.099750:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_management_surface.cc:64] Failed to get image description for color space.
[3534:0731/212935.105070:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:277] Unable to set image transfer function.
[3534:0731/212935.105095:ERROR:ui/ozone/platform/wayland/host/wayland_wp_color_manager.cc:195] Failed to populate image description for color space {primaries:BT709, transfer:SRGB, matrix:RGB, range:FULL}
^C[liveuser@CachyOS Documents]date +%s
1785533381
[liveuser@CachyOS Documents]$ 

[liveuser@CachyOS Documents]$ ls -la ~/.local/share/jadeite/
total 136
drwx------  2 liveuser liveuser     80 Jul 31 21:26 .
drwxr-xr-x 13 liveuser liveuser    360 Jul 31 21:25 ..
-rw-r--r--  1 liveuser liveuser 135168 Jul 31 21:26 jadeite.db
-rw-------  1 liveuser liveuser    626 Jul 31 21:25 jadeite.keys
[liveuser@CachyOS Documents]$ ls -la ~/.config/jadeite/
total 84
drwx------ 13 liveuser liveuser   380 Jul 31 21:29  .
drwxr-xr-x  1 liveuser liveuser   700 Jul 31 21:25  ..
drwx------  4 liveuser liveuser    80 Jul 31 21:25  Cache
drwx------  5 liveuser liveuser   100 Jul 31 21:25 'Code Cache'
drwx------  2 liveuser liveuser    60 Jul 31 21:25  Crashpad
-rw-------  1 liveuser liveuser 36864 Jul 31 21:26  DIPS
drwx------  2 liveuser liveuser   140 Jul 31 21:25  DawnGraphiteCache
drwx------  2 liveuser liveuser   140 Jul 31 21:25  DawnWebGPUCache
drwx------  2 liveuser liveuser    60 Jul 31 21:25  Dictionaries
drwx------  2 liveuser liveuser   140 Jul 31 21:25  GPUCache
-rw-------  1 liveuser liveuser    57 Jul 31 21:25 'Local State'
drwx------  3 liveuser liveuser    60 Jul 31 21:25 'Local Storage'
-rw-------  1 liveuser liveuser   564 Jul 31 21:26 'Network Persistent State'
-rw-------  1 liveuser liveuser    57 Jul 31 21:25  Preferences
drwx------  2 liveuser liveuser   160 Jul 31 21:29 'Session Storage'
drwx------  3 liveuser liveuser   100 Jul 31 21:25 'Shared Dictionary'
-rw-------  1 liveuser liveuser 36864 Jul 31 21:25 'Trust Tokens'
-rw-------  1 liveuser liveuser     0 Jul 31 21:25 'Trust Tokens-journal'
drwx------  3 liveuser liveuser    60 Jul 31 21:29  blob_storage
[liveuser@CachyOS Documents]$ 

[liveuser@CachyOS Documents]$ sudo pacman -R jadeite
checking dependencies...

Package (1)  Old Version  Net Change 

jadeite      1.0.0-1      -318.10 MiB

Total Removed Size:  318.10 MiB

:: Do you want to remove these packages? [Y/n] 
:: Processing package changes...
(1/1) removing jadeite                             [----------------] 100%
:: Running post-transaction hooks...
(1/3) Arming ConditionNeedsUpdate...
(2/3) Updating icon theme caches...
(3/3) Updating the desktop file MIME type cache...
[liveuser@CachyOS Documents]$ ls /opt/JADEITE /usr/bin/jadeite /usr/share/applications/jadeite.desktop 2>&1
ls: cannot access '/opt/JADEITE': No such file or directory
ls: cannot access '/usr/bin/jadeite': No such file or directory
ls: cannot access '/usr/share/applications/jadeite.desktop': No such file or directory
[liveuser@CachyOS Documents]$ ls ~/.local/share/jadeite/
jadeite.db  jadeite.keys
[liveuser@CachyOS Documents]$ 






















