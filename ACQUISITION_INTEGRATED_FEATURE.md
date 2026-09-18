# TRACE Consultant OS — Acquisition Feature

Acquisition is now integrated as a native TRACE Consultant OS navigation feature.

- Main TRACE Consultant OS remains the existing core application.
- Acquisition is opened from the `Growth & Acquisition → Acquisition` sidebar item.
- The Acquisition app is isolated inside the existing TRACE OS shell to prevent CSS/JS collisions with the core modules.
- Discovery uses the included Netlify functions when deployed online.
- Acquisition assets live under `features/acquisition_os/`.
- No core TRACE Consultant calculation/storage modules are replaced by this integration.
