// Generates a Wordle-like board PNG from a 2D array of emoji state tiles.
// Supported tiles: ⬛ (absent), 🟨 (present), 🟩 (correct), 🔳 (empty / not yet used)
// Returns a Promise<Buffer> containing PNG bytes.
// Example usage:
// import { generateBoardPng, writeBoardPng } from './boardpng.js';
// const state = [
//   ["⬛","⬛","⬛","🟩","⬛"],
//   ["🟨","⬛","⬛","🟨","⬛"],
//   ["⬛","⬛","🟨","🟨","⬛"],
//   ["🟨","⬛","⬛","🟩","⬛"],
//   ["🟩","🟩","🟩","🟩","🟩"],
//   ["🔳","🔳","🔳","🔳","🔳"],
// ];
// const buf = await generateBoardPng(state);
// await writeFile('board.png', buf);

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Lazy load Resvg to reduce cold start time
let _resvgClsPromise = null;
async function getResvg() {
	if (_resvgClsPromise) return _resvgClsPromise;
	_resvgClsPromise = import('@resvg/resvg-js').then(m => m.Resvg);
	return _resvgClsPromise;
}
import crypto from 'crypto';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Simple in-memory LRU caches to speed up repeated renders
const _headerCache = new Map(); // key: JSON.stringify({w,text,fontPath,bg}) -> Jimp
const _boardCache = new Map();  // key: hash(state,opts) -> Jimp
const _avatarCache = new Map(); // key: `${src}|${mtime}|${diameter}` or `placeholder:${diameter}` -> Jimp
const _panelCache = new Map();  // key: JSON.stringify({w,h,fill,stroke,sw,rad}) -> Jimp
const CACHE_LIMIT = { header: 32, board: 128, avatar: 64, panel: 32 };

function _lruSet(map, key, value, limit) {
	if (map.has(key)) { map.delete(key); }
	map.set(key, value);
	if (map.size > limit) {
		const oldest = map.keys().next().value;
		map.delete(oldest);
	}
}

// Preload font into memory and warm up WASM renderer once per process
let _fontDataUrl = null; // 'data:font/ttf;base64,...'
let _warmupPromise = null;
let _jimpPromise = null; // lazy-loaded Jimp
async function getJimp() {
	if (_jimpPromise) return _jimpPromise;
	_jimpPromise = import('jimp').then(m => m.default || m);
	return _jimpPromise;
}
async function getFontDataUrl(fontPath) {
		if (_fontDataUrl) return _fontDataUrl;
		try {
				const p = fontPath || getDefaultFontPath();
				if (p && fsSync.existsSync(p)) {
						const b = fsSync.readFileSync(p);
						_fontDataUrl = `data:font/ttf;base64,${b.toString('base64')}`;
						return _fontDataUrl;
				}
		} catch {}
		return null;
}

function warmupResvgOnce() {
		if (_warmupPromise) return _warmupPromise;
		_warmupPromise = (async () => {
				try {
						const f = await getFontDataUrl(getDefaultFontPath());
						const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2">
	<defs>
		<style>
			${f ? `@font-face { font-family: 'W'; src: url('${f}'); }` : ''}
		</style>
	</defs>
	<rect width="100%" height="100%" fill="#000"/>
	<text x="1" y="1" font-family="W" font-size="1" fill="#fff">w</text>
</svg>`;
						const Resvg = await getResvg();
						const r = new Resvg(svg, { fitTo: { mode: 'original' } });
						r.render();
				} catch {}
		})();
		return _warmupPromise;
}

// Warm up at module load to reduce first-render latency
warmupResvgOnce();

async function renderHeaderToJimp(width, text, fontPath, background) {
	const cacheKey = JSON.stringify({ w: width, t: text, f: fontPath || '(auto)', b: background });
	const cached = _headerCache.get(cacheKey);
	if (cached) return cached.clone();
	// Render header via SVG + Resvg (WASM). Fallback to bitmap font on failure.
	if (!fontPath) {
		fontPath = getDefaultFontPath();
	}
	try {
		if (fontPath) {
			const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64">
	<defs>
		<style>
			@font-face { font-family: 'ShareHeader'; src: url('file://${fontPath.replace(/\\/g,'/')}'); font-weight: normal; font-style: normal; }
		</style>
	</defs>
	<rect width="100%" height="100%" fill="${background}"/>
	<text x="50%" y="50%" fill="#ffffff" font-family="ShareHeader" font-size="32" dominant-baseline="middle" text-anchor="middle">${escapeXml(text)}</text>
</svg>`;
			const Resvg = await getResvg();
			const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
			const pngData = resvg.render();
			const pngBuffer = pngData.asPng();
			const Jimp = await getJimp();
			const img = await Jimp.read(pngBuffer);
			_lruSet(_headerCache, cacheKey, img, CACHE_LIMIT.header);
			return img.clone();
		}
	} catch (e) {
		console.warn('Resvg header render failed:', e.message);
	}
	// Fallback: Jimp bitmap font (no Polish diacritics) -> will show '?' for ł.
	const Jimp = await getJimp();
	const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
	const header = new Jimp(width, 64, background);
	const textWidth = Jimp.measureText(font, text);
	header.print(font, (width - textWidth) / 2, 0, text);
	if (/ł|Ł/.test(text)) {
		console.warn('ł character requires a custom TTF font. Provide options.fontPath to avoid ?');
	}
	_lruSet(_headerCache, cacheKey, header, CACHE_LIMIT.header);
	return header;
}

function escapeXml(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

// no timeouts needed; Resvg is synchronous

let _defaultFontPath = undefined; // undefined => not resolved yet; null => resolution attempted but none found
function fileExists(p) {
	try { return !!p && fsSync.existsSync(p); } catch { return false; }
}
function getAlternateFontCandidates() {
	return [
		// Order fonts with broad Latin coverage first
		'C:/Windows/Fonts/arial.ttf',
		'C:/Windows/Fonts/segoeui.ttf',
		'C:/Windows/Fonts/calibri.ttf',
		'C:/Windows/Fonts/times.ttf',
		'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
		'/usr/share/fonts/truetype/freefont/FreeSans.ttf',
		'/System/Library/Fonts/Supplemental/Arial.ttf',
		'/System/Library/Fonts/Supplemental/Helvetica.ttc',
		'/System/Library/Fonts/Supplemental/Times New Roman.ttf'
	];
}

function getBundledFontCandidates() {
	const dir = path.join(__dirname, 'fonts');
	const names = [
		'DejaVuSans.ttf',
		'NotoSans-Regular.ttf',
		'NotoSansDisplay-Regular.ttf',
		'NotoSans-Variable.ttf'
	];
	const out = [];
	for (const n of names) {
		const p = path.join(dir, n);
		if (fileExists(p)) out.push(p);
	}
	// also include any .ttf in fonts dir
	try {
		const entries = fsSync.readdirSync(dir);
		for (const e of entries) {
			if (e.toLowerCase().endsWith('.ttf')) {
				const p = path.join(dir, e);
				if (!out.includes(p)) out.push(p);
			}
		}
	} catch {}
	return out;
}
function getDefaultFontPath() {
	if (_defaultFontPath !== undefined) return _defaultFontPath; // return cached (could be null)
	// 0. Prefer bundled fonts checked into repo under server/fonts
	const bundled = getBundledFontCandidates();
	if (bundled.length) {
		_defaultFontPath = bundled[0];
		console.warn('Using bundled font for Unicode header:', _defaultFontPath);
		return _defaultFontPath;
	}
	// 1. Probe common system font paths (Windows / macOS / Linux)
	const systemCandidates = getAlternateFontCandidates();
	for (const candidate of systemCandidates) {
		if (fileExists(candidate)) {
			_defaultFontPath = candidate;
			console.warn('Using system font for Unicode header:', candidate);
			return _defaultFontPath;
		}
	}
	console.warn('No default TTF font found. Polish characters may not render. Provide options.fontPath.');
	_defaultFontPath = null;
	return _defaultFontPath;
}

/** Color palette (sRGB hex) matching classic Wordle styling */
const COLORS = {
	background: '#121213',
	gridBackground: '#121213',
	absent: '#3a3a3c', // ⬛
	present: '#b59f3b', // 🟨
	correct: '#538d4e', // 🟩
	emptyBorder: '#3a3a3c', // border for 🔳
};

/**
 * Convert #rrggbb to {r,g,b}
 */
function hexToRgb(hex) {
	const v = parseInt(hex.slice(1), 16);
	return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function drawRect(png, x, y, w, h, color) {
	const { r, g, b } = hexToRgb(color);
	for (let iy = y; iy < y + h; iy++) {
		for (let ix = x; ix < x + w; ix++) {
			const idx = (iy * png.width + ix) << 2;
			png.data[idx] = r;
			png.data[idx + 1] = g;
			png.data[idx + 2] = b;
			png.data[idx + 3] = 255;
		}
	}
}

function drawRoundedRect(png, x, y, w, h, radius, color) {
	// Simple rounded rect by drawing full rect then masking corners with background.
	drawRect(png, x, y, w, h, color);
	radius = Math.min(radius, Math.min(w, h) / 2);
	const bg = hexToRgb(COLORS.background);
	for (let iy = y; iy < y + h; iy++) {
		for (let ix = x; ix < x + w; ix++) {
			const rx = ix - (x + radius);
			const ry = iy - (y + radius);
			const rx2 = ix - (x + w - radius - 1);
			const ry2 = iy - (y + h - radius - 1);
			// Four corners: if outside quarter circle, paint background.
			const inTopLeft = ix < x + radius && iy < y + radius && rx * rx + ry * ry > radius * radius;
			const inTopRight = ix >= x + w - radius && iy < y + radius && rx2 * rx2 + ry * ry > radius * radius;
			const inBottomLeft = ix < x + radius && iy >= y + h - radius && rx * rx + ry2 * ry2 > radius * radius;
			const inBottomRight = ix >= x + w - radius && iy >= y + h - radius && rx2 * rx2 + ry2 * ry2 > radius * radius;
			if (inTopLeft || inTopRight || inBottomLeft || inBottomRight) {
				const idx = (iy * png.width + ix) << 2;
				png.data[idx] = bg.r;
				png.data[idx + 1] = bg.g;
				png.data[idx + 2] = bg.b;
				png.data[idx + 3] = 255;
			}
		}
	}
}

/** Map emoji to fill & border */
function tileStyle(ch) {
	switch (ch) {
		case '🟩':
			return { fill: COLORS.correct };
		case '🟨':
			return { fill: COLORS.present };
		case '⬛':
			return { fill: COLORS.absent };
		case '🔳':
			return { fill: COLORS.gridBackground, border: COLORS.emptyBorder };
		default:
			return { fill: COLORS.gridBackground, border: COLORS.emptyBorder };
	}
}

/**
 * Generate a PNG buffer of the board.
 * @param {string[][]} state 2D array (rows x cols) of emoji tiles.
 * @param {object} [opts]
 * @param {number} [opts.tileSize=64] Size of each square tile in pixels.
 * @param {number} [opts.gap=8] Gap between tiles.
 * @param {number} [opts.pad=32] Outer padding around the grid.
 * @param {boolean} [opts.rounded=true] Whether to draw subtle rounded outer frame.
 * @returns {Promise<Buffer>} PNG bytes.
 */
export async function generateBoardPng(state, opts = {}) {
	const { PNG } = await import('pngjs');
	const rows = state.length;
	const cols = state[0]?.length || 0;
	if (!rows || !cols) throw new Error('State array must be non-empty');

	const tileSize = opts.tileSize ?? 64;
	const gap = opts.gap ?? 8;
	const pad = opts.pad ?? 32;
	const rounded = opts.rounded ?? true;

	const width = pad * 2 + cols * tileSize + (cols - 1) * gap;
	const height = pad * 2 + rows * tileSize + (rows - 1) * gap;

	const png = new PNG({ width, height });
	// Fill background
	drawRect(png, 0, 0, width, height, COLORS.background);

	// Optional rounded frame highlight
	if (rounded) {
		drawRoundedRect(png, 4, 4, width - 8, height - 8, 16, '#1f1f20');
	}

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const x = pad + c * (tileSize + gap);
			const y = pad + r * (tileSize + gap);
			const { fill, border } = tileStyle(state[r][c]);
			drawRect(png, x, y, tileSize, tileSize, fill);
			if (border) {
				// 2px border
				drawRect(png, x, y, tileSize, 2, border);
				drawRect(png, x, y + tileSize - 2, tileSize, 2, border);
				drawRect(png, x, y, 2, tileSize, border);
				drawRect(png, x + tileSize - 2, y, 2, tileSize, border);
			}
		}
	}

	return await new Promise((resolve, reject) => {
		const chunks = [];
		png.pack()
			.on('data', d => chunks.push(d))
			.on('end', () => resolve(Buffer.concat(chunks)))
			.on('error', reject);
	});
}

/** Convenience helper to write to file */
export async function writeBoardPng(state, filePath, opts) {
	const buf = await generateBoardPng(state, opts);
	await fs.writeFile(filePath, buf);
	return filePath;
}

// FAST path: render full card(s) as SVG and rasterize once with Resvg at 1920x1080
export async function generateShareImageFast(stateOrPlayers, wordleNumber, options = {}) {
	const players = normalizePlayers(stateOrPlayers, options);
	if (!players.length) throw new Error('No players provided');

	const W = 1920, H = 1080;
	const headerH = 96;
	const panelFill = '#1b1b1c';
	const panelStroke = '#2a2a2b';
	const topPad = 16;
	const bottomPad = 32;
	const colSpacing = 32;
	const fontPath = options.fontPath || getDefaultFontPath();
	const headerText = options.headerText || `Słówko nr. ${wordleNumber}`;

	const gap = options.gap ?? 8;
	const padBoard = options.padBoard ?? 24;
	const innerSpacing = 40;
	const panelPad = 32;
	const tileSize = options.tileSize ?? 48;

	function boardDims(rows, cols) {
		return {
			w: padBoard * 2 + cols * tileSize + (cols - 1) * gap,
			h: padBoard * 2 + rows * tileSize + (rows - 1) * gap
		};
	}

	const specs = players.map((p) => {
		const rows = p.state.length;
		const cols = p.state[0]?.length || 0;
		const bd = boardDims(rows, cols);
		if (players.length === 1) {
			const avatarD = Math.min(280, bd.h - 32);
			return { rows, cols, bd, avatarD, layout: 'single' };
		}
		const avatarD = Math.min(128, Math.max(96, Math.floor(bd.w * 0.25)));
		const cardW = Math.max(bd.w, avatarD) + 20;
		const cardH = 12 + avatarD + 12 + bd.h + 12;
		return { rows, cols, bd, avatarD, cardW, cardH, layout: 'multi' };
	});

	// Use file:// URLs so the renderer loads avatar images directly (no base64 encoding in Node)
	const avatarRefs = players.map((p) => {
		if (!p.avatar) return null;
		return 'file://' + p.avatar.replace(/\\/g, '/');
	});

	function renderBoardRects(x0, y0, spec, playerIndex) {
		let out = '';
		const t = tileSize;
		for (let r = 0; r < spec.rows; r++) {
			for (let c = 0; c < spec.cols; c++) {
				const x = x0 + padBoard + c * (t + gap);
				const y = y0 + padBoard + r * (t + gap);
				const ch = players[playerIndex].state[r][c];
				const st = tileStyle(ch);
				if (st.border) {
					out += `<rect x="${x}" y="${y}" width="${t}" height="${t}" fill="${st.fill}" stroke="${st.border}" stroke-width="2"/>`;
				} else {
					out += `<rect x="${x}" y="${y}" width="${t}" height="${t}" fill="${st.fill}"/>`;
				}
			}
		}
		return out;
	}

	let svgCards = '';
	let contentW = 0, contentH = 0;
	if (players.length === 1) {
		const s = specs[0];
		const panelW = panelPad * 2 + s.avatarD + innerSpacing + s.bd.w;
		const panelH = panelPad * 2 + Math.max(s.avatarD, s.bd.h);
		contentW = panelW;
		contentH = panelH;
		const panelX = 0;
		const panelY = 0;
		const avX = panelX + panelPad;
		const avY = panelY + panelPad + Math.round((Math.max(s.avatarD, s.bd.h) - s.avatarD) / 2);
		const boardX = avX + s.avatarD + innerSpacing;
		const boardY = panelY + panelPad + Math.round((Math.max(s.avatarD, s.bd.h) - s.bd.h) / 2);
		const avId = `av0`;
	const avImg = avatarRefs[0];
        svgCards += `
  <g>
	<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="16" ry="16" fill="${panelFill}" stroke="${panelStroke}" />
	<defs><clipPath id="${avId}"><circle cx="${avX + s.avatarD/2}" cy="${avY + s.avatarD/2}" r="${s.avatarD/2}"/></clipPath></defs>
	${avImg ? `<image href="${avImg}" x="${avX}" y="${avY}" width="${s.avatarD}" height="${s.avatarD}" clip-path="url(#${avId})"/>` : `<circle cx="${avX + s.avatarD/2}" cy="${avY + s.avatarD/2}" r="${s.avatarD/2}" fill="#218ca0"/>`}
	${renderBoardRects(boardX, boardY, s, 0)}
  </g>`;
	} else {
				const cardsW = specs.reduce((sum, s, i) => sum + s.cardW + (i ? colSpacing : 0), 0);
				contentW = cardsW;
				contentH = Math.max(...specs.map(s => s.cardH));
				let cursorX = 0;
				const cardsTop = 0;
		for (let i = 0; i < players.length; i++) {
			const s = specs[i];
			const panelW = s.cardW;
			const panelH = s.cardH;
						const panelX = cursorX;
						const panelY = cardsTop;
			const avX = panelX + Math.round((panelW - s.avatarD) / 2);
			const avY = panelY + 12;
			const boardX = panelX + Math.round((panelW - s.bd.w) / 2);
			const boardY = avY + s.avatarD + 12;
			const avId = `av${i}`;
			const avImg = avatarRefs[i];
            svgCards += `
  <g>
	<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="16" ry="16" fill="${panelFill}" stroke="${panelStroke}" />
	<defs><clipPath id="${avId}"><circle cx="${avX + s.avatarD/2}" cy="${avY + s.avatarD/2}" r="${s.avatarD/2}"/></clipPath></defs>
	${avImg ? `<image href="${avImg}" x="${avX}" y="${avY}" width="${s.avatarD}" height="${s.avatarD}" clip-path="url(#${avId})"/>` : `<circle cx="${avX + s.avatarD/2}" cy="${avY + s.avatarD/2}" r="${s.avatarD/2}" fill="#218ca0"/>`}
	${renderBoardRects(boardX, boardY, s, i)}
  </g>`;
			cursorX += panelW + colSpacing;
		}
	}

				// Compute scale and translation to center content in the area below the header
				const maxW = W - 2 * 64; // horizontal margin
				const maxH = H - headerH - topPad - bottomPad;
				const scale = Math.min(maxW / contentW, maxH / contentH);
				const offsetX = Math.round((W - contentW * scale) / 2);
				const offsetY = Math.round(headerH + topPad + (maxH - contentH * scale) / 2);

				const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
	<style>
			${(await getFontDataUrl(fontPath)) ? `@font-face { font-family: 'ShareHeader'; src: url('${await getFontDataUrl(fontPath)}'); }` : ''}
	  text { font-family: 'ShareHeader', sans-serif; }
	</style>
  </defs>
  <rect width="100%" height="100%" fill="${COLORS.background}"/>
  <text x="50%" y="${Math.round(headerH/2)}" fill="#ffffff" font-size="36" dominant-baseline="middle" text-anchor="middle">${escapeXml(headerText)}</text>
	<g transform="translate(${offsetX}, ${offsetY}) scale(${scale})">
		${svgCards}
	</g>
</svg>`;

    const Resvg = await getResvg();
    const resvg = new Resvg(svg, { fitTo: { mode: 'original' } });
    return resvg.render().asPng();
}

/**
 * Generate share card with header, circular avatar & board using pure JS (Jimp).
 * @param {string[][]} state
 * @param {number|string} wordleNumber
 * @param {{avatar?:string}} options
 */
export async function generateShareImage(stateOrPlayers, wordleNumber, options = {}) {
	const Jimp = await getJimp();
	// Accept either a single player's grid (string[][]) or an array of players: { state: string[][], avatar?: string }
	const players = normalizePlayers(stateOrPlayers, options);
	if (!players.length) throw new Error('No players provided');

	// Common constants
	const headerHeight = 70;
	const panelFill = '#1b1b1c';
	const marginBottom = 24;

	// Single-player special layout (avatar left, board right, rounded panel like screenshot)
	if (players.length === 1) {
		const p = players[0];
		const rows = p.state.length;
		const cols = p.state[0]?.length || 0;
		const tileSize = options.tileSize ?? (cols <= 5 ? 32 : 28);
		const gap = options.gap ?? 6;
		const padBoard = options.padBoard ?? 16;
		const boardWidth = padBoard * 2 + cols * tileSize + (cols - 1) * gap;
		const boardHeight = padBoard * 2 + rows * tileSize + (rows - 1) * gap;
		const avatarDiameter = Math.min(180, boardHeight - 24);
		const innerSpacing = 32;
		const panelPad = 24;
		const panelWidth = panelPad * 2 + avatarDiameter + innerSpacing + boardWidth;
		const panelHeight = panelPad * 2 + Math.max(avatarDiameter, boardHeight);
		const totalWidth = Math.max(panelWidth + 48, 480);
		const totalHeight = headerHeight + 16 + panelHeight + marginBottom;

		const image = new Jimp(totalWidth, totalHeight, COLORS.background);

		// Header
		const headerText = options.headerText || `Słówko nr. ${wordleNumber}`;
		let headerImage;
		try {
			headerImage = await renderHeaderToJimp(totalWidth, headerText, options.fontPath, COLORS.background);
		} catch (e) {
			const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
			headerImage = new Jimp(totalWidth, 64, COLORS.background);
			const textWidth = Jimp.measureText(font, headerText);
			headerImage.print(font, (totalWidth - textWidth) / 2, 0, headerText);
		}
		image.composite(headerImage, 0, 16);

		// Panel
		const panelX = Math.round((totalWidth - panelWidth) / 2);
		const panelY = headerHeight + 16;
		const panelImg = await renderRoundedPanel(panelWidth, panelHeight, panelFill, '#2a2a2b', 1, 16);
		image.composite(panelImg, panelX, panelY);

		// Avatar
		const avatarImg = await renderAvatarCircleToJimp(p.avatar, avatarDiameter);
		const avX = panelX + panelPad;
		const avY = panelY + panelPad + Math.round((Math.max(avatarDiameter, boardHeight) - avatarDiameter) / 2);
		image.composite(avatarImg, avX, avY);

		// Board
		const boardBuf = await generateBoardPng(p.state, { tileSize, gap, pad: padBoard, rounded: false });
		const boardImg = await Jimp.read(boardBuf);
		const boardX = avX + avatarDiameter + innerSpacing;
		const boardY = panelY + panelPad + Math.round((Math.max(avatarDiameter, boardHeight) - boardHeight) / 2);
		image.composite(boardImg, boardX, boardY);

		const finalImg = await fitToSize(image, 1920, 1080, COLORS.background);
		return await finalImg.getBufferAsync(Jimp.MIME_PNG);
	}

	// Multi-player layout (columns of cards)
	const marginX = 24;
	const colSpacing = 32;
	const borderColor = 0x2a2a2bff; // RGBA

	const cardSpecs = await Promise.all(players.map(async (p) => {
		const rows = p.state.length;
		const cols = p.state[0]?.length || 0;
		if (!rows || !cols) throw new Error('Each player.state must be a non-empty grid');
		const tileSize = options.tileSize ?? (cols <= 5 ? 32 : 28);
		const gap = options.gap ?? 6;
		const padBoard = options.padBoard ?? 16;
		const boardWidth = padBoard * 2 + cols * tileSize + (cols - 1) * gap;
		const boardHeight = padBoard * 2 + rows * tileSize + (rows - 1) * gap;
		const avatarDiameter = Math.min(boardWidth - 20, 128);
		const cardWidth = Math.max(boardWidth, avatarDiameter) + 20;
		const cardHeight = 12 + avatarDiameter + 12 + boardHeight + 12;
	// Pre-render avatar and board for fast compositing
	const avatarImg = await renderAvatarCircleToJimp(p.avatar, avatarDiameter);
	const boardBuf = await generateBoardPng(p.state, { tileSize, gap, pad: padBoard, rounded: false });
	const boardImg = await Jimp.read(boardBuf);
	return { rows, cols, tileSize, gap, padBoard, boardWidth, boardHeight, avatarDiameter, cardWidth, cardHeight, avatarImg, boardImg };
	}));

	const totalWidth = marginX * 2 + cardSpecs.reduce((sum, s, i) => sum + s.cardWidth + (i > 0 ? colSpacing : 0), 0);
	const maxCardHeight = Math.max(...cardSpecs.map(s => s.cardHeight));
	const totalHeight = headerHeight + 16 + maxCardHeight + marginBottom;

	const image = new Jimp(totalWidth, totalHeight, COLORS.background);

	const headerText = options.headerText || `Słówko nr. ${wordleNumber}`;
	let headerImage;
	try {
		headerImage = await renderHeaderToJimp(totalWidth, headerText, options.fontPath, COLORS.background);
	} catch (e) {
		console.warn('Header render failed, falling back to bitmap font:', e.message);
		const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
		headerImage = new Jimp(totalWidth, 64, COLORS.background);
		const textWidth = Jimp.measureText(font, headerText);
		headerImage.print(font, (totalWidth - textWidth) / 2, 0, headerText);
	}
	image.composite(headerImage, 0, 16);

	let cursorX = marginX;
	const cardsTop = headerHeight + 16;
	for (let i = 0; i < players.length; i++) {
	const s = cardSpecs[i];
		const panel = new Jimp(s.cardWidth, s.cardHeight, panelFill);
		image.composite(panel, cursorX, cardsTop);
		drawBorder(image, cursorX, cardsTop, s.cardWidth, s.cardHeight, borderColor);

		const avX = cursorX + Math.round((s.cardWidth - s.avatarDiameter) / 2);
		const avY = cardsTop + 12;
		image.composite(s.avatarImg, avX, avY);

	const boardX = cursorX + Math.round((s.cardWidth - s.boardWidth) / 2);
	const boardY = avY + s.avatarDiameter + 12;
	image.composite(s.boardImg, boardX, boardY);
		cursorX += s.cardWidth + colSpacing;
	}

	const finalImg = await fitToSize(image, 1920, 1080, COLORS.background);
	return await finalImg.getBufferAsync(Jimp.MIME_PNG);
}

function normalizePlayers(stateOrPlayers, options) {
	// If looks like a grid (rows of strings), wrap as single player
	if (Array.isArray(stateOrPlayers) && Array.isArray(stateOrPlayers[0]) && typeof stateOrPlayers[0][0] === 'string') {
		return [{ state: stateOrPlayers, avatar: options?.avatar }];
	}
	// If array of objects with .state
	if (Array.isArray(stateOrPlayers) && stateOrPlayers.length && typeof stateOrPlayers[0] === 'object' && Array.isArray(stateOrPlayers[0].state)) {
		return stateOrPlayers;
	}
	return [];
}

function drawBorder(img, x, y, w, h, color) {
	for (let i = 0; i < w; i++) {
		img.setPixelColor(color, x + i, y);
		img.setPixelColor(color, x + i, y + h - 1);
	}
	for (let j = 0; j < h; j++) {
		img.setPixelColor(color, x, y + j);
		img.setPixelColor(color, x + w - 1, y + j);
	}
}

// Ensure final output is a fixed aspect ratio by padding (no scaling)
async function padToAspect(img, targetRatio = 16/9, background = COLORS.background) {
	const Jimp = await getJimp();
	const w = img.bitmap.width;
	const h = img.bitmap.height;
	const r = w / h;
	if (Math.abs(r - targetRatio) < 1e-4) return img;
	let newW, newH;
	if (r > targetRatio) {
		// too wide -> increase height
		newW = w;
		newH = Math.ceil(w / targetRatio);
	} else {
		// too tall -> increase width
		newH = h;
		newW = Math.ceil(h * targetRatio);
	}
	const out = new Jimp(newW, newH, background);
	const offsetX = Math.round((newW - w) / 2);
	const offsetY = Math.round((newH - h) / 2);
	out.composite(img, offsetX, offsetY);
	return out;
}

// Resize with letterboxing to exact WxH while preserving aspect ratio
async function fitToSize(img, targetW = 1920, targetH = 1080, background = COLORS.background) {
	const Jimp = await getJimp();
	const w = img.bitmap.width;
	const h = img.bitmap.height;
	const scale = Math.min(targetW / w, targetH / h);
	const newW = Math.max(1, Math.round(w * scale));
	const newH = Math.max(1, Math.round(h * scale));
	const resized = img.clone().resize(newW, newH);
	const canvas = new Jimp(targetW, targetH, background);
	const offsetX = Math.round((targetW - newW) / 2);
	const offsetY = Math.round((targetH - newH) / 2);
	canvas.composite(resized, offsetX, offsetY);
	return canvas;
}

// Render a rounded panel using SVG+Resvg so it looks crisp with true rounded corners
async function renderRoundedPanel(width, height, fill, stroke, strokeWidth = 1, radius = 16) {
	const cacheKey = JSON.stringify({ w: width, h: height, f: fill, s: stroke, sw: strokeWidth, r: radius });
	const cached = _panelCache.get(cacheKey);
	if (cached) return cached.clone();
	const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${radius}" ry="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
  
</svg>`;
	const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
	const png = resvg.render().asPng();
	const Jimp = await getJimp();
	const img = await Jimp.read(png);
	_lruSet(_panelCache, cacheKey, img, CACHE_LIMIT.panel);
	return img.clone();
}

// Fast circular avatar rendering using SVG clipPath and Resvg
async function renderAvatarCircleToJimp(srcPath, diameter) {
	try {
		const keyPrefix = srcPath ? srcPath : 'placeholder';
		let mtime = 0;
		if (srcPath) {
			try { mtime = fsSync.statSync(srcPath).mtimeMs || 0; } catch {}
		}
		const cacheKey = `${keyPrefix}|${mtime}|${diameter}`;
		const cached = _avatarCache.get(cacheKey);
		if (cached) return cached.clone();
		if (srcPath) {
			const Jimp = await getJimp();
			const img = await Jimp.read(srcPath);
			img.cover(diameter, diameter);
			// Use Resvg to clip to a circle for clean edges
			const b64 = await img.getBase64Async(Jimp.MIME_PNG);
			const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}">
  <defs>
	<clipPath id="clip"><circle cx="${diameter/2}" cy="${diameter/2}" r="${diameter/2}"/></clipPath>
  </defs>
  <image href="${b64}" x="0" y="0" width="${diameter}" height="${diameter}" clip-path="url(#clip)"/>
  
</svg>`;
			const Resvg = await getResvg();
			const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: diameter } });
			const buf = resvg.render().asPng();
			const out = await (await getJimp()).read(buf);
			_lruSet(_avatarCache, cacheKey, out, CACHE_LIMIT.avatar);
			return out.clone();
		}
	} catch (e) {
		console.warn('Avatar read/clip failed, using placeholder:', e.message);
	}
	// Placeholder colored circle
	const cacheKey = `placeholder:${diameter}`;
	const cached = _avatarCache.get(cacheKey);
	if (cached) return cached.clone();
	// Draw circle edge anti-aliased via Resvg, to keep it fast
	const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}">
  <circle cx="${diameter/2}" cy="${diameter/2}" r="${diameter/2}" fill="#218ca0" />
</svg>`;
	const Resvg = await getResvg();
	const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: diameter } });
	const buf = resvg.render().asPng();
	const img = await (await getJimp()).read(buf);
	_lruSet(_avatarCache, cacheKey, img, CACHE_LIMIT.avatar);
	return img.clone();
}

// Build a Windows Snipping Tool-like output path for single-player share images
function buildWindowsScreenClipPath(filenameGuid) {
	const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : null);
	if (!localAppData) return null;
	const dir = path.join(localAppData, 'Packages', 'MicrosoftWindows.Client.CBS_cw5n1h2txyewy', 'TempState', 'ScreenClip');
	const name = `{${filenameGuid}}.png`;
	return { dir, filePath: path.join(dir, name) };
}

/**
 * Write share image to disk.
 * - If options.outputPath provided, writes there.
 * - Else, if a single player is provided, writes to Windows ScreenClip folder using a GUID file name: {GUID}.png
 *   Path example: C:\Users\<user>\AppData\Local\Packages\MicrosoftWindows.Client.CBS_cw5n1h2txyewy\TempState\ScreenClip\{GUID}.png
 * Returns the written absolute path.
 */
export async function writeShareImage(stateOrPlayers, wordleNumber, options = {}) {
	const players = normalizePlayers(stateOrPlayers, options);
	const buf = await generateShareImageFast(stateOrPlayers, wordleNumber, options);

	let outPath = options.outputPath;
	if (!outPath && players.length === 1) {
		const guid = (crypto.randomUUID ? crypto.randomUUID() : undefined) || ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
			(c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16)
		);
		const built = buildWindowsScreenClipPath(guid);
		if (built) {
			await fs.mkdir(built.dir, { recursive: true });
			outPath = built.filePath;
		}
	}
	if (!outPath) {
		// Fallback generic name in cwd
		outPath = path.resolve(`share-${Date.now()}.png`);
	}
	await fs.writeFile(outPath, buf);
	console.log('[share] wrote', outPath, 'bytes=', buf.length);
	return outPath;
}

// Explicit warmup API for long-running servers; call periodically to keep WASM and fonts hot
export async function warmShareRenderer(options = {}) {
		try {
				// Ensure font is resolved and cached
				await getFontDataUrl(options.fontPath || getDefaultFontPath());
				// Warm up Resvg
				await warmupResvgOnce();
				// Render a tiny SVG using the embedded font to keep glyph path hot (includes ł)
				const f = await getFontDataUrl(options.fontPath || getDefaultFontPath());
				const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">
	<defs>
		<style>
			${f ? `@font-face { font-family: 'Warm'; src: url('${f}'); }` : ''}
		</style>
	</defs>
	<rect width="100%" height="100%" fill="#000"/>
	<text x="4" y="4" font-family="Warm" font-size="6" fill="#fff" dominant-baseline="middle" text-anchor="middle">ł</text>
</svg>`;
				const Resvg = await getResvg();
				new Resvg(svg, { fitTo: { mode: 'original' } }).render();
				return true;
		} catch (e) {
				console.warn('warmShareRenderer failed:', e && e.message || e);
				return false;
		}
}

