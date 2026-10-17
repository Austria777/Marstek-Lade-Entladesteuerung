# GitHub setup / repository upload

This folder is the complete Marstek Energy Studio **v0.4.1** source tree.

1. On GitHub, create a new **private** repository named `marstek-energy-studio` under your own account. A README on the new repository is optional; an initialized repository may be easier for a connector upload.
2. Ensure ChatGPT's GitHub app has repository access under **GitHub → Settings → Applications → Installed GitHub Apps → Configure** if needed.
3. Put the **contents of this folder** at the *root* of the GitHub repository (do not upload only the ZIP as a single file).
4. Confirm that `custom_components/marstek_pv_manager/manifest.json`, `dashboard.yaml`, and `www/marstek-energy-flow-card.js` are visible in the repository.
5. When the repository is available to your connected GitHub account, changes can be committed directly or via a pull request.

## Important

- This is an untested Home Assistant / Marstek **prototype**; code tests do not replace on-device testing.
- Do not run the old seven-second YAML automation and the new Python controller at the same time.
- Back up Home Assistant before installation or updating; start disabled and test carefully.
- The card JS is copied manually into `/config/www/`; adding the integration to HACS does not automatically install the card.
- The existing source `sensor.pv_leistung_gesamt` does not yet include the three new balcony PV systems.
- Never commit credentials, tokens, personal secrets or your live Home Assistant configuration.
