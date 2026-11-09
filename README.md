# PhysLab

An Applied Physics lab helper for first-year engineering students. Four practicals plus a Graph Analyzer:
Laser Beam Divergence, PN Junction Diode, Hall Effect, and Optical Fibre Numerical Aperture.
It is plain HTML, CSS and JavaScript. No frameworks, no installs, no internet, no API keys.

## Folder structure

```
physlab/
  index.html    the page structure (logo, bottom menu, footer)
  style.css     all the styling (colours, layout, mobile rules)
  script.js     all the logic: formulas, tables, saving, graphs, practicals, Graph Analyzer
  assets/       images and icons (just logo.svg)
  README.md     this file
```

`script.js` starts with a table of contents. Reading order: formulas (`P`) -> helpers -> saving -> table engine (`Tbl`) -> graph drawing (`MiniChart`) -> the four practicals -> `analyzer()` -> router.

## Run with VS Code Live Server

1. Install VS Code and the extension **Live Server** (by Ritwick Dey).
2. File > Open Folder... and choose the `physlab` folder.
3. Right-click `index.html` > **Open with Live Server** (or click "Go Live" at the bottom right).
4. The site opens at `http://127.0.0.1:5500`. Saving a file reloads the page automatically.

You can also just double-click `index.html`. To try it on your phone, connect the phone to the same Wi-Fi and open `http://<your-computer-IP>:5500`.

## Saving your readings

Readings are saved automatically in the browser (localStorage, key `physlab:v1`), separately for each practical. Refreshing or closing the page keeps them. Each practical has "Reset this experiment..." (it asks first). Readings are stored per web address: data saved at `127.0.0.1:5500` is not visible when you open the file by double-clicking, and the other way round.

## Physics notes

- Laser: theta0 = sqrt(w2^2 - w1^2) / D (formula from the practical sheet).
- Diode: R_D = dV/dI (mA converted to A); static R = V/I.
- Hall: V_H on the y-axis; R_H = m*t/B or m*t/I; concentration = 1/(|R_H| e). Negative slopes are allowed; carrier type depends on the sign convention you pick (check your kit's wiring).
- Fibre: X = (Hd + Vd)/4, N.A. = X / sqrt(X^2 + d^2), i = asin(N.A.).

## Future idea: camera / photo import (NOT implemented)

Plan: photograph an observation table, let an AI read the numbers, show them to the student to confirm, then draw graphs with the existing Graph Analyzer.

How the code is ready for it:

- Put the new code in its own section of `script.js` (or a new `camera.js`).
- After the student confirms the values, call `setReadings(tableId, rows)`. It cleans and saves the rows and redraws the page, so the tables and the Analyzer update by themselves. Table ids: `lt` laser, `dt` diode, `hta` / `htb` Hall, `ft` fibre.
- Do NOT put an API key in `script.js` or any browser file, because anyone can read it. The AI call must go through a small server (for example a serverless function) that holds the key; the page only sends the photo to that server.

## Logo

`assets/logo.svg` is the only logo file. It is used as the browser tab icon and in the header (on the navy header pill its background blends in, so only the P, orbit dot and wave show).

Meaning of the design:
- The letter **P** (Physics) is built from a stem and a ring, like an atomic orbit or a lens aperture.
- The yellow dot on the ring is an **electron / photon**.
- The cyan wave along the bottom is **light and signals** (laser beam, optical fibre), travelling to a coral **detector** dot, which stands for measurement.
- Deep navy, off-white, yellow, cyan and coral are the website's own palette.
