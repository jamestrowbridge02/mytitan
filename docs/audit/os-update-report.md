# MyTitan OS Update Report

Generated: 2026-06-29 11:52 UTC
Host: srv1178818
Scope: read-only package audit; no updates installed and no services restarted.

## Summary

- Ubuntu: 24.04.4 LTS (noble)
- Kernel running: 6.8.0-111-generic
- Expected newer kernel per needrestart: 6.8.0-124-generic
- Reboot required: yes
- Packages upgradable: 63
- Packages kept back: 2 (`cloud-init`, `fwupd`)
- Held packages: `cloud-init`
- Automatically removable packages: `libslirp0`, `slirp4netns`
- Ubuntu Pro: not attached
- Pending Universe/Multiverse security updates without Ubuntu Pro coverage: 9
- Unattended upgrades: active; recent log entries show successful checks and `cloud-init` held back

## Packages Requiring Attention

The package simulation reported these notable update groups:

- Docker runtime: `docker-ce`, `docker-ce-cli`, `docker-compose-plugin`, `docker-buildx-plugin`, `docker-model-plugin`, `docker-ce-rootless-extras`, `containerd.io`
- Kernel/reboot support: `linux-base`
- System security/runtime: `apparmor`, `libapparmor1`, `nftables`, `libnftables1`, `iproute2`, `rsyslog`, `coreutils`
- Guest/platform tooling: `open-vm-tools`, `qemu-guest-agent`
- Network stack: `netplan.io`, `netplan-generator`, `python3-netplan`, `network-manager`, `libnm0`, `wpasupplicant`
- Node runtime: `nodejs`
- Ubuntu management: `ubuntu-pro-client`, `ubuntu-pro-client-l10n`, `software-properties-common`, `software-properties-gtk`
- Desktop/X packages present on host: `xserver-*`, `gtk-*`, `gnome-*`

## Restart Requirements

`needrestart -b` reported:

- Kernel status: running kernel is behind the expected kernel.
- Services requiring restart: `dbus.service`, `docker.service`, `NetworkManager.service`, `systemd-logind.service`, `unattended-upgrades.service`, `wpa_supplicant.service`.

`/var/run/reboot-required.pkgs` includes:

- `linux-image-6.8.0-117-generic`
- `linux-base`
- `linux-image-6.8.0-124-generic`

## Failed or Held Update Signals

- No unattended-upgrades failure was observed in the sampled log tail.
- `cloud-init` is intentionally held and repeatedly reported as held back.
- `fwupd` is kept back by the simulated upgrade.
- `apt autoremove` has candidates, but no cleanup was executed.

## Maintenance Recommendation

Do not apply package updates during normal traffic. Schedule a maintenance window that:

1. Confirms a fresh encrypted backup and restore preview.
2. Stops MyTitan traffic or places the app in maintenance mode if available.
3. Applies OS and Docker updates deliberately.
4. Reboots to load the current kernel.
5. Restarts Docker Compose services in dependency order.
6. Runs post-restart validation before accepting traffic.

This report does not mark the host ready for public launch; it only identifies the package state needed for maintenance planning.
