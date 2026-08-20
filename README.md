# The Supply Station

The Supply Station is a free-supplies request and pickup app for Faith Outreach Church. Families use an approved access code to browse available inventory, select supplies within their approved budget, and request a pickup time. Church volunteers use the protected admin panel to review requests, manage inventory, issue access tokens, and maintain pickup settings.

## Features

- Public access-code gate for approved families
- Inventory browsing by category
- Budget tracking while items are selected
- Pickup requests with day and time-slot selection
- Admin request review, inventory management, order tracking, and settings
- Email notifications through EmailJS
- Installable PWA for phones, tablets, and desktop browsers
- Service-worker caching for faster repeat launches and basic offline shell support

## Platforms and Services

- **GitHub Pages** hosts the static website from the `main` branch.
- **Supabase** provides the REST API and database. The app reads and writes inventory, orders, requests, and the row with `id=1` in the `settings` table.
- **EmailJS** sends pickup and access-request notifications without requiring a custom server.
- **jsDelivr** and **cdnjs** provide the EmailJS and QR code browser libraries used by the app.

## Project Files

- `index.html` contains the application markup, styles, and client-side JavaScript.
- `manifest.webmanifest` defines the installable app name, colors, launch behavior, and `logo.png` icon.
- `sw.js` provides service-worker caching for the PWA shell and CDN libraries.
- `logo.png` is the primary PWA icon and branding asset.
- `CNAME` configures the custom GitHub Pages domain.

## Developer Notes

This is a dependency-free static project. There is no build step, package manager, or backend server in the repository. Changes to `index.html`, `manifest.webmanifest`, or `sw.js` can be tested directly in a browser and deployed by pushing to `main`.

For local development, use a local HTTP server rather than opening `index.html` directly when testing service-worker or PWA behavior. GitHub Pages provides the HTTPS context required for installation in production.

The browser client uses Supabase REST requests with the project URL and anon key defined in `index.html`. Keep database permissions and Row Level Security policies configured in Supabase; do not place a service-role key in this repository. The admin password is read from `settings.admin_password` for the settings row where `id=1`.

The service worker uses a versioned cache. Increment `VERSION` in `sw.js` when cached shell assets need to be refreshed for existing installations.

## Deployment

1. Make and test changes locally.
2. Commit the changes to Git.
3. Push to the `main` branch.
4. GitHub Pages publishes the updated static files.

After a deployment, an installed PWA may need to be reopened or refreshed before the service worker activates the newest version.
