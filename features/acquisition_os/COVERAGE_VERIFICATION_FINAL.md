# COVERAGE VERIFICATION FINAL

Production Acquisition is loaded by `index.html` through the iframe path `features/acquisition_os/index.html`.

Explicit selectable coverage areas:
- DKI Jakarta
- Kota Bogor
- Kabupaten Bogor
- Kota Depok
- Kota Bekasi
- Kabupaten Bekasi
- Kota Tangerang
- Kabupaten Tangerang
- Kota Tangerang Selatan
- Kota Bandung
- Kabupaten Bandung
- Kabupaten Bandung Barat
- Kota Cimahi

The Google coverage selector now uses explicit area-to-center mappings, so a specific city/regency selection does not fall back to the whole Jabodetabek/Bandung group. OSM uses explicit administrative area names for the same coverage keys.
