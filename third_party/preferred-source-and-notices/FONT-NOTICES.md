# Font notices and asset scope

Inspected 2026-10-05. These are factual notices extracted from retained binary assets. Package-level Apache/MIT metadata does not replace these font-specific grants. No font bytes were changed.

## MathJax 4.1.3

127 retained WOFF2 files are enumerated with SHA-256 and exact embedded legal name records in `font-metadata.json`.

### Asset group (84 files)

Example: `node_modules/@mathjax/mathjax-newcm-font/chtml/woff2/mjx-ncm-ab.woff2`

Copyright:

(C) 2019-2021 Antonis Tsolomitis. 
This work is released under the GUST Font License -- see http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt for details.

Trademark notice:

Please refer to the Copyright section for the font trademark attribution notices.

### Asset group (21 files)

Example: `node_modules/@mathjax/mathjax-newcm-font/chtml/woff2/mjx-ncm-b-a.woff2`

Copyright:

Copyright (c) 2024 MathJax, Inc. (www.mathjax.org)
Original copyright:
(C) 2019-2021 Antonis Tsolomitis. 
This work is released under the GUST Font License -- see http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt for details.

Trademark notice:

Please refer to the Copyright section for the font trademark attribution notices.

### Asset group (20 files)

Example: `node_modules/@mathjax/mathjax-tex-font/chtml/woff2/mjx-tex-b.woff2`

Copyright:

Copyright (c) 2022, MathJax, Inc. (&lt;www.mathjax.org&gt;)

Trademark notice:

Please refer to the Copyright section for the font trademark attribution notices.

License statement:

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license available with a FAQ at:
http://scripts.sil.org/OFL

License URL:

http://scripts.sil.org/OFL

### Asset group (2 files)

Example: `node_modules/@mathjax/mathjax-tex-font/chtml/woff2/mjx-tex-brk.woff2`

Copyright:

Copyright (c) 2009-2010 Design Science, Inc.

Trademark notice:

Please refer to the Copyright section for the font trademark attribution notices.

License statement:

Copyright (c) 2009-2010, Design Science, Inc. (<www.mathjax.org>),
with Reserved Font Name MathJax_Main.

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license available with a FAQ at:
http://scripts.sil.org/OFL

License URL:

http://scripts.sil.org/OFL

The 105 NewCM files name the GUST Font License. `font-license-texts/GUST-FONT-LICENSE.txt` and the referenced `LPPL-1.3c.txt` are included. The 22 TeX files name SIL OFL 1.1; the license body is in `font-license-texts/OFL-1.1.txt`. Keep original copyright and reserved-name metadata with the font files.

MathJax JavaScript/package code remains under its original Apache-2.0 notices; `font-license-texts/Apache-2.0.txt` is copied byte-for-byte from `@mathjax/src@4.1.3/LICENSE`. This is not a blanket relicensing of font assets.

## KaTeX 0.18.10

All 20 inspected TTF faces carry SIL OFL 1.1. `katex-font-metadata.json` preserves each face’s exact copyright statement and Reserved Font Name, including Design Science and Khan Academy notices. Their companion WOFF/WOFF2 files are retained unchanged in the npm archive; their metadata was not separately decoded in this pass.

All inspected KaTeX TTFs state:

Copyright (c) 2009-2010 Design Science, Inc.
Copyright (c) 2014-2018 Khan Academy

Reserved Font Names found:
- KaTeX_AMS.
- KaTeX_Caligraphic.
- KaTeX_Caligraphic.
- KaTeX_Fraktur.
- KaTeX_Fraktur.
- KaTeX_Main.
- KaTeX_Main.
- KaTeX_Main.
- KaTeX_Main.
- KaTeX_Math.
- KaTeX_Math.
- KaTeX_SansSerif.
- KaTeX_SansSerif.
- KaTeX_SansSerif.
- KaTeX_Script.
- KaTeX_Size1.
- KaTeX_Size2.
- KaTeX_Size3.
- KaTeX_Size4.
- KaTeX_Typewriter.

OFL allows bundling fonts with software while requiring preservation of its license and copyright notices; modified font naming and standalone font sale have separate conditions. These fonts should not be described as wholly GPL/AGPL relicensed.

## Build-source limitation

The MathJax font npm packages contain `def/*.ts`, generated JS/font tables, and WOFF2 assets. Those definitions call `@mathjax/font-tools`, local `fonts/*.otf`, `../subsets/MJX-Extra-Regular.otf`, and `../bin/*`. These prerequisites are absent. The registry-declared `mathjax/MathJax-fonts` repository and exact `gitHead` archive return 404, and the font-tools npm endpoint returns 404. Official MathJax font documentation says its font-generation tools are not yet publicly released. Actual retained assets and these notices can be preserved, but their generation is not independently reproducible from the available bundle. This evidence does not by itself establish license incompatibility or prohibit ordinary bundling.
