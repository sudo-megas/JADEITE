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
# What that costs is one bit and one profile.
#
# The bit: the package ships `chrome-sandbox` at 0755 and `post_install` raises
# it to 4755 on machines where user namespaces do not work — the only machines
# where Chromium falls back to the SUID helper. An upgrade re-lays the file at
# its packaged mode and nothing puts the bit back, so the application stops
# starting on exactly the machines that need the helper, and only after an
# upgrade. A fresh-install test cannot reach it by construction, which is why it
# was carried from Realisation X to XI as something to be observed rather than
# inferred.
#
# The profile: this file's first version dropped the AppArmor block on the
# argument that it was "Ubuntu 24+ machinery a pacman package never meets", and
# that was simply wrong. The package ships `resources/apparmor-profile` and
# `post_install` installs it to `/etc/apparmor.d/jadeite`, and the profile's
# whole body is `userns,` for `/opt/JADEITE/jadeite` — which is the *same*
# sandbox concern as the bit, reached by the other mechanism. An owner who
# installs on a box where AppArmor is not yet enabled, then enables it, then
# upgrades, would get no profile and no SUID bit, and the application would not
# start. So the block is here, and the reasoning that removed it is recorded
# above rather than quietly replaced.
#
# What is still deliberately absent is `update-alternatives`' first-install
# dance and the mime database refresh's first-install case: an upgrade needs the
# link re-established, not registered for the first time.
#
# Passed raw to fpm through `pacman.fpm` in electron-builder.yml, so no
# `${executable}` substitution happens — the names are written out. fpm resolves
# the path against its own working directory, which `npm run package` makes the
# project root; a missing file fails the build loudly rather than silently
# dropping the scriptlet.

# The symlink usually survives an upgrade, since pacman does not run the old
# package's post_remove. Re-establishing it is idempotent, and it repairs one
# that has been broken by hand. `-n` matters: without it, a `/usr/bin/jadeite`
# that is somehow a symlink to a directory would be dereferenced and the new
# link written *inside* it.
if type update-alternatives >/dev/null 2>&1; then
    if [ -L '/usr/bin/jadeite' -a -e '/usr/bin/jadeite' -a "`readlink '/usr/bin/jadeite'`" != '/etc/alternatives/jadeite' ]; then
        rm -f '/usr/bin/jadeite'
    fi
    update-alternatives --install '/usr/bin/jadeite' 'jadeite' '/opt/JADEITE/jadeite' 100 || ln -sfn '/opt/JADEITE/jadeite' '/usr/bin/jadeite'
else
    ln -sfn '/opt/JADEITE/jadeite' '/usr/bin/jadeite'
fi

# The reason this file exists. Same test and same two modes as post_install:
# SUID only where user namespaces are unavailable, and plain 0755 where they
# work, so a machine that gained working namespaces between versions does not
# keep a setuid binary it no longer needs. Guarded on the file's existence so
# that a future Electron which stops shipping the helper does not print a
# `chmod: cannot access` line into the middle of every upgrade transaction.
#
# One honest limitation, the same one post_install has always had: this runs as
# root, and root's `unshare --user` can succeed on a kernel where the owner's
# would fail. The test therefore answers "can root do this", not "can the owner"
# — correct on Arch, where the restricting sysctl does not exist, and the reason
# the failure still wants observing on a box where it does.
if [ -e '/opt/JADEITE/chrome-sandbox' ]; then
    if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
        chmod 4755 '/opt/JADEITE/chrome-sandbox' || true
    else
        chmod 0755 '/opt/JADEITE/chrome-sandbox' || true
    fi
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# The AppArmor half, mirroring post_install rather than improving on it. The
# profile is static and version-independent, so refreshing it on every upgrade
# costs nothing; what this is really for is the machine that had no profile at
# install time because AppArmor was not yet enabled there.
if apparmor_status --enabled > /dev/null 2>&1; then
  APPARMOR_PROFILE_SOURCE='/opt/JADEITE/resources/apparmor-profile'
  APPARMOR_PROFILE_TARGET='/etc/apparmor.d/jadeite'
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
    cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"

    # Live AppArmor operations are not meaningful inside a chroot — the same
    # guard post_install uses, and for the same reason.
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
    fi
  else
    echo "Skipping the AppArmor profile: this version of AppArmor does not support the bundled one"
  fi
fi
