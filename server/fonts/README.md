Fonts

- Place TTF fonts in this folder for header text rendering (via Resvg SVG text).
- A default bundled TTF placed here will be auto-picked without extra config.
- Recommended: DejaVuSans.ttf or NotoSans-Regular.ttf (include Polish ł, ą, ś, ć, ź, ż, ń, ó).

How it works
- Code prefers server/fonts/*.ttf first, then tries system fonts.
- You can override by passing options.fontPath to generateShareImage.

Licensing
- Only add fonts you are licensed to distribute. Open options: DejaVu Sans, Noto Sans.
