# HA+ Matter Hub Supervisor app

This repository retains the **1.2.0 Supervisor app** for existing installations.
Updates to the maintained Matter Hub are published as a Home Assistant
integration in a separate repository. The integration uses Home Assistant
2026.11 or newer and is installed as a custom Integration in Marketplace.
[Integration installation](https://github.com/zvikarp/ha-plus-matter-hub/blob/main/docs/Getting%20Started/Installation.md#install-from-marketplace)

## Using the legacy app

Open **HA+ Matter Hub** in the Home Assistant sidebar or use **Open Web UI** on
the app page. Matter controllers need IPv6 and mDNS connectivity to the Home
Assistant host. The app uses Home Assistant's Supervisor credentials.

| Option | Purpose |
| --- | --- |
| `app_log_level` | Controls which messages appear in the app log. The default is `info`. |
| `disable_log_colors` | Disables ANSI colors in the app log. The default is `false`. |
| `mdns_network_interface` | Sets the host interface used for Matter discovery. Leave it empty to use automatic selection. |

## Keeping existing Matter pairings during migration

Supervisor cannot upgrade this app in place to the integration. Back up the app,
then stop it and disable automatic startup before copying the entire engine
data directory. The directory contains the Matter identities and fabrics needed
to preserve pairings. Keep the app installed until the integration is verified,
and run only one engine with the same bridge identities at a time.
[Migration and rollback instructions](https://github.com/zvikarp/ha-plus-matter-hub/blob/main/docs/Getting%20Started/Installation.md#migrate-an-existing-app-installation)
