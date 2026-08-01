#!/bin/bash
#
# pacman's `post_upgrade`, which no other target needs.
#
# electron-builder hands fpm `--after-install` and `--after-remove` and nothing
# else, and the two package managers disagree about what that means. dpkg runs
# `postinst configure` on an upgrade as well as on a first install, so the deb
# has always been whole. pacman does not: it calls `post_install` only when the
# package is new, and `post_upgrade` when one version replaces another. With no
# `post_upgrade` in `.INSTALL`, `pacman -U` over an installed JADEITE ran
# nothing at all.
#
# What that costs is one bit. The package ships `chrome-sandbox` at 0755 and
# `post_install` raises it to 4755 on machines where user namespaces do not
# work — the only machines where Chromium falls back to the SUID helper. An
# upgrade re-laid the file at its packaged mode and nothing put the bit back,
# so the application stopped starting on exactly the machines that need the
# helper, and only after an upgrade. A fresh-install test cannot reach it by
# construction, which is why it was carried from Realisation X to XI as
# something to be observed rather than inferred.
#
# This is deliberately not a copy of electron-builder's after-install template.
# That template is upstream's to change and `tests/package/metadata.spec.ts`
# says so; duplicating it here would mean owning its AppArmor block — Ubuntu
# 24+ machinery that a pacman package never meets — and re-owning it at every
# upgrade of the builder. What an upgrade actually needs is here and nothing
# more: the bit, the launcher symlink, and the two caches that describe a
# desktop entry which may have changed.
#
# Passed raw to fpm through `pacman.fpm` in electron-builder.yml, so no
# `${executable}` substitution happens — the names are written out.

# The symlink usually survives an upgrade, since pacman does not run the old
# package's post_remove. Re-establishing it is idempotent, and it repairs one
# that has been broken by hand.
if type update-alternatives >/dev/null 2>&1; then
    if [ -L '/usr/bin/jadeite' -a -e '/usr/bin/jadeite' -a "`readlink '/usr/bin/jadeite'`" != '/etc/alternatives/jadeite' ]; then
        rm -f '/usr/bin/jadeite'
    fi
    update-alternatives --install '/usr/bin/jadeite' 'jadeite' '/opt/JADEITE/jadeite' 100 || ln -sf '/opt/JADEITE/jadeite' '/usr/bin/jadeite'
else
    ln -sf '/opt/JADEITE/jadeite' '/usr/bin/jadeite'
fi

# The reason this file exists. Same test and same two modes as post_install:
# SUID only where user namespaces are unavailable, and plain 0755 where they
# work, so a machine that gained working namespaces between versions does not
# keep a setuid binary it no longer needs.
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    chmod 4755 '/opt/JADEITE/chrome-sandbox' || true
else
    chmod 0755 '/opt/JADEITE/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi
