...... #REALISATION IX ALREADY BUILT!......
## this is between #Realisation IX and Realisation X

This conficon.md will be about the app icons, use scenarios, possible reactions to anticipated problems, placement configurations ... + (ideas not indicated here) that first XJADEITE.md isn't included in.

GENERAL TARGET FRAMEWORK
    *Try your best not to change any of the already built geometry of app elements. Because the app has been built estimately for %95. I'dont want to exploit and mess up what is already built.
    *Original icon pixels are big enough for resizing (most likely downsizing)
    *Icon aspect ratio must not be changed. Otherwise spanning or stretching misalignments will occur.


# ICON 1 = `build/innerAPP.png`
    "USE SCENARIOS"
    > it will be on the top-left of the rail. Before "JADEITE" TEXT = <icon><3 chr space><"JADEITE">
    > will be placed on top-left of the "password-confirmation" or "recovery-key" pop-ups (sub-windows)
    > Will be used for OS installers (.exe , .deb(if applicable), arch-executable, etc.)


# ICON 2 = `build/outerAPP.png`
     "USE SCENARIOS"
    > After installations, the app must use this icon in; application-launchers(such as kwin, wofi, lofi, noctalia app launcher, windows start menu etc.), waybars, any launchers, 
    > In bottom of the rail, we will create: "<info-svg> About" menu. Inside of this menu this icon will be embedded on top everything, version id, creator of the app, github link for read more, release date etc.

Before proceeding i want to give you my idea of "About" layout:

        PAGE PHYSICAL TOP
----------------------------------------
%20 up page-margin
$ICON (centered)(if too big test 0.75x..0.70x..0.65x..0.60x..0.50x downscaling)
(space)
(space)
$Creator (centered)
(space)
(space)
$Version (centered)
$Release Date (centered)
(space)
(space)
$Github link (centered)
$Readme (github README.md document direct-link) (centered)
$Licence <name of the licence>...<read more>(bridged to full licence text)
(space)
(space)
$MOTTO= "Built with Passion and Reason"(could be italic and greyed)
%20 bottom page-margin
----------------------------------------
        PAGE PHYSICAL BOTTOM