// ============================================================
// cube.js — Scryboard Cube Page
// ============================================================

// --- URL parsing ---
const params = new URLSearchParams(window.location.search);
const cubeId = params.get('cube');

if (!cubeId) {
    window.location.href = 'index.html';
}

// --- Shared cube data ---
let cubeData = null;

// --- DOM refs ---
const loadingScreen = document.getElementById('loading-screen');
const errorScreen   = document.getElementById('error-screen');
const errorMessage  = document.getElementById('error-message');
const cubeContent   = document.getElementById('cube-content');

// ============================================================
// INIT
// ============================================================

async function init() {
    try {
        const res = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${cubeId}`);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const raw = await res.json();

        // Log the full response so we can inspect the shape in DevTools
        console.log('[Scryboard] CubeCobra raw response:', raw);

        // Normalise: CubeCobra may return { cube, cards } or the cube directly
        const cube  = raw.cube  ?? raw;
        const cards = raw.cards ?? cube.cards ?? {};

        if (!cube.name) throw new Error('Unexpected response shape — no cube.name found');

        cubeData = { cube, cards };

        document.title = `${cube.name} — Scryboard`;

        populateHero(cube, cards);
        populatePrimer(cube);

        loadingScreen.classList.add('hidden');
        cubeContent.classList.remove('hidden');

    } catch (err) {
        console.error('[Scryboard] Error loading cube:', err);
        loadingScreen.classList.add('hidden');
        errorScreen.classList.remove('hidden');
        errorMessage.textContent = `Error: ${err.message}. Cube ID: "${cubeId}". Check the console for more detail.`;
    }
}

// ============================================================
// HERO
// ============================================================

function populateHero(cube, cards) {
    document.getElementById('hero-name').textContent  = cube.name;
    document.getElementById('hero-owner').textContent = cube.owner?.username ?? cube.owner ?? 'Unknown';
    document.getElementById('hero-count').textContent = (cards.mainboard ?? []).length;

    const img = document.getElementById('hero-img');
    const uri = cube.image?.uri ?? cube.image ?? null;

    if (uri) {
        img.src = uri;
        img.alt = cube.name;
    } else {
        img.style.display = 'none';
    }
}

// ============================================================
// PRIMER PARSER — CubeCobra Markdown
// ============================================================

function populatePrimer(cube) {
    const desc = cube.description ?? '';
    const el   = document.getElementById('primer-content');
    if (!desc.trim()) {
        el.innerHTML = '<p style="color:var(--text-light);font-style:italic;">This cube has no description.</p>';
        return;
    }
    el.innerHTML = parseCubeDescription(desc);
}
 
// Decode HTML entities CubeCobra may encode in the description (e.g. &gt; → >)
function decodeEntities(str) {
    const el = document.createElement('textarea');
    el.innerHTML = str;
    return el.value;
}
 
// ---- Block parser ----
function parseCubeDescription(raw) {
    const stash = [];
    function hide(html) {
        const t = `\x00${stash.length}\x00`;
        stash.push(html);
        return t;
    }
    const isToken = s => /^\x00\d+\x00$/.test(s);
 
    let s = decodeEntities(raw);
 
    // PASS 1 — Fenced code blocks  ```lang\n...\n```
    s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const cls = lang ? ` class="language-${escapeAttr(lang)}"` : '';
        return hide(`<pre class="primer-pre"><code${cls}>${escapeHtml(code.trimEnd())}</code></pre>`);
    });
 
    // PASS 2 — Centred blocks  >>> ... <<<
    s = s.replace(/>>>([\s\S]*?)<<</g, (_, inner) => {
        const trimmed = inner.trim();
        let content;
        if (trimmed.includes('\n')) {
            // Multiline: handle each line as a block element
            content = trimmed.split('\n').map(line => {
                const lt = line.trim();
                if (!lt) return '';
                const hm = lt.match(/^(#{1,6})\s+(.+)/);
                if (hm) {
                    const lvl = Math.min(hm[1].length + 2, 6);
                    return `<h${lvl} class="primer-h">${parseInline(hm[2])}</h${lvl}>`;
                }
                return `<p>${parseInline(lt)}</p>`;
            }).filter(Boolean).join('');
        } else {
            const hm = trimmed.match(/^(#{1,6})\s+(.+)/);
            if (hm) {
                const lvl = Math.min(hm[1].length + 2, 6);
                content = `<h${lvl} class="primer-h">${parseInline(hm[2])}</h${lvl}>`;
            } else {
                content = parseInline(trimmed);
            }
        }
        return hide(`<div class="primer-centered">${content}</div>`);
    });
 
    // PASS 3 — Gallery rows  <<[[!Card1]][[!Card2]]>>  (line-anchored)
    s = s.replace(/^[ \t]*<<([\s\S]*?)>>[ \t]*$/gm, (_, inner) => {
        const imgs = [];
        const re   = /\[\[!(\/\/|\/)?([^\]|\\]+?)(?:[\\]?\|([^\]]+))?\]\]/g;
        let m;
        while ((m = re.exec(inner)) !== null) {
            imgs.push(cardImg(m[2].trim(), m[3]?.trim() ?? null));
        }
        return hide(`<div class="primer-gallery">${imgs.join('')}</div>`);
    });
 
    // Line-by-line block processing
    const lines = s.split('\n');
    const out   = [];
    let i = 0;
 
    while (i < lines.length) {
        const t = lines[i].trim();
 
        // Stash token
        if (isToken(t)) {
            out.push(stash[Number(t.match(/\d+/)[0])]);
            i++; continue;
        }
 
        // Blank
        if (t === '') { i++; continue; }
 
        // Heading
        const hm = t.match(/^(#{1,6})\s+(.+)/);
        if (hm) {
            const lvl = Math.min(hm[1].length + 2, 6);
            const id  = hm[2].toLowerCase().replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-');
            out.push(`<h${lvl} id="${id}" class="primer-h">${parseInline(hm[2])}</h${lvl}>`);
            i++; continue;
        }
 
        // HR
        if (t.match(/^[-*_]{3,}$/) && !/\s/.test(t)) {
            out.push('<hr class="primer-rule">');
            i++; continue;
        }
 
        // Blockquote
        if (t.startsWith('>')) {
            const bq = [];
            while (i < lines.length && lines[i].trim().startsWith('>')) {
                bq.push(lines[i].trim().replace(/^>\s?/, ''));
                i++;
            }
            out.push(`<blockquote class="primer-blockquote"><p>${parseInline(bq.join('<br>'))}</p></blockquote>`);
            continue;
        }
 
        // Table (next line must be delimiter row)
        if (t.includes('|') && i + 1 < lines.length
                && lines[i+1].trim().match(/^\|?[\s|:\-]+\|/)) {
            const tbl = [];
            while (i < lines.length && lines[i].trim().includes('|')) {
                tbl.push(lines[i].trim());
                i++;
            }
            out.push(parseTable(tbl));
            continue;
        }
 
        // Unordered list
        if (t.match(/^[-*+]\s/)) {
            const items = [];
            while (i < lines.length && lines[i].trim().match(/^[-*+]\s/)) {
                const lt = lines[i].trim();
                const tm = lt.match(/^[-*+]\s\[([ x])\]\s+(.*)/i);
                if (tm) {
                    const chk = tm[1].toLowerCase() === 'x' ? ' checked' : '';
                    items.push(`<li class="primer-task"><input type="checkbox"${chk} disabled> ${parseInline(tm[2])}</li>`);
                } else {
                    items.push(`<li>${parseInline(lt.replace(/^[-*+]\s/, ''))}</li>`);
                }
                i++;
            }
            out.push(`<ul class="primer-list">${items.join('')}</ul>`);
            continue;
        }
 
        // Ordered list
        if (t.match(/^\d+[.)]\s/)) {
            const items = [];
            while (i < lines.length && lines[i].trim().match(/^\d+[.)]\s/)) {
                const lt = lines[i].trim();
                const tm = lt.match(/^\d+[.)]\s\[([ x])\]\s+(.*)/i);
                if (tm) {
                    const chk = tm[1].toLowerCase() === 'x' ? ' checked' : '';
                    items.push(`<li class="primer-task"><input type="checkbox"${chk} disabled> ${parseInline(tm[2])}</li>`);
                } else {
                    items.push(`<li>${parseInline(lt.replace(/^\d+[.)]\s/, ''))}</li>`);
                }
                i++;
            }
            out.push(`<ol class="primer-list">${items.join('')}</ol>`);
            continue;
        }
 
        // Paragraph
        const para = [];
        while (i < lines.length) {
            const lt = lines[i].trim();
            if (lt === '')                                          break;
            if (isToken(lt))                                       break;
            if (lt.match(/^#{1,6}\s/))                            break;
            if (lt.match(/^[-*+]\s/))                             break;
            if (lt.match(/^\d+[.)]\s/))                           break;
            if (lt.match(/^[-*_]{3,}$/) && !/\s/.test(lt))       break;
            if (lt.startsWith('>'))                                break;
            if (lt.startsWith('```'))                              break;
            if (lt.includes('|') && i + 1 < lines.length
                    && lines[i+1].trim().match(/^\|?[\s|:\-]+\|/)) break;
            para.push(parseInline(lt));
            i++;
        }
        if (para.length) out.push(`<p>${para.join('<br>')}</p>`);
    }
 
    // Restore any stash tokens that ended up embedded in paragraph HTML
    return out.join('\n').replace(/\x00(\d+)\x00/g, (_, n) => stash[Number(n)]);
}
 
// ---- Inline parser ----
function parseInline(text) {
    // 1. External image: ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
        (_, alt, url) => `<img class="primer-ext-img" src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" loading="lazy">`
    );
 
    // 2. Card image: [[!//Name]], [[!/Name]], [[!Name]], with optional |id
    text = text.replace(/\[\[!(\/\/|\/)?([^\]|\\]+?)(?:[\\]?\|([^\]]+))?\]\]/g,
        (_, _p, name, id) => cardImg(name.trim(), id?.trim() ?? null)
    );
 
    // 3. Card link: [[/Name|id]], [[Name|id]], [[/Name]], [[Name]]
    text = text.replace(/\[\[(\/)?([^\]!|\\]+?)(?:[\\]?\|([^\]]+))?\]\]/g,
        (_, _s, name, id) => cardRef(name.trim(), id?.trim() ?? null)
    );
 
    // 4. Mana symbols: {W} {U/R} {2/W} {W/P} {T} {15} etc.
    text = text.replace(/\{([^}]+)\}/g, (_, sym) => manaSymbol(sym));
 
    // 5. Strikethrough
    text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');
 
    // 6. Bold + italic
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
 
    // 7. Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.+?)__/g,      '<strong>$1</strong>');
 
    // 8. Italic
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    text = text.replace(/\b_(.+?)_\b/g,   '<em>$1</em>');
 
    // 9. Inline code
    text = text.replace(/`([^`]+)`/g,
        (_, code) => `<code class="primer-code">${escapeHtml(code)}</code>`
    );
 
    // 10. @mentions — BEFORE markdown links, with negative lookbehind so
    //     @user inside a URL (after / or :) is never matched
    text = text.replace(/(?<![:/\w])@(\w+)/g,
        '<a href="https://cubecobra.com/user/view/$1" target="_blank" rel="noopener">@$1</a>'
    );
 
    // 11. Markdown links: [text](url)
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
 
    return text;
}
 
// ---- Table parser ----
function parseTable(lines) {
    const parseRow = line =>
        line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const headers = parseRow(lines[0]);
    const delims  = parseRow(lines[1]);
    const align   = delims.map(d => {
        const l = d.startsWith(':'), r = d.endsWith(':');
        if (l && r) return 'center';
        if (r)      return 'right';
        if (l)      return 'left';
        return null;
    });
    const th = headers.map((h, j) => {
        const a = align[j] ? ` style="text-align:${align[j]}"` : '';
        return `<th${a}>${parseInline(h)}</th>`;
    }).join('');
    const tb = lines.slice(2).map(line => {
        const cells = parseRow(line);
        return '<tr>' + cells.map((c, j) => {
            const a = align[j] ? ` style="text-align:${align[j]}"` : '';
            return `<td${a}>${parseInline(c)}</td>`;
        }).join('') + '</tr>';
    }).join('');
    return `<div class="primer-table-wrap"><table class="primer-table"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
}
 
// ---- Card image ----
function cardImg(name, id) {
    // If no explicit id but name IS a UUID, treat it as the Scryfall ID
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const resolvedId = id ?? (uuidRe.test(name) ? name : null);
 
    if (resolvedId) {
        const cdnSrc = `https://cards.scryfall.io/normal/front/${resolvedId[0]}/${resolvedId[1]}/${resolvedId}.jpg`;
        const apiSrc = `https://api.scryfall.com/cards/${resolvedId}?format=image`;
        return `<img class="primer-card-img card-ref"
                     src="${escapeAttr(cdnSrc)}"
                     onerror="this.onerror=null;this.src='${escapeAttr(apiSrc)}'"
                     data-card="${escapeAttr(name)}"
                     alt="${escapeAttr(name)}"
                     loading="lazy">`;
    }
 
    const src = `https://api.scryfall.com/cards/named?format=image&exact=${encodeURIComponent(name)}`;
    return `<img class="primer-card-img card-ref"
                 src="${escapeAttr(src)}"
                 data-card="${escapeAttr(name)}"
                 alt="${escapeAttr(name)}"
                 loading="lazy">`;
}
 
// ---- Card reference link ----
function cardRef(name, id) {
    const href = `https://cubecobra.com/tool/card/${encodeURIComponent(name)}`;
    return `<a class="card-ref" href="${escapeAttr(href)}" data-card="${escapeAttr(name)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`;
}
 
// ---- Mana symbol ----
function manaSymbol(sym) {
    const s = sym.toUpperCase();
    if (s.includes('/')) {
        const map = { W:'w', U:'u', B:'b', R:'r', G:'g', C:'c', P:'p', S:'s' };
        const cls = s.split('/').map(p => map[p] ?? p.toLowerCase()).join('');
        return `<i class="ms ms-${cls} ms-cost"></i>`;
    }
    const named = { W:'w',U:'u',B:'b',R:'r',G:'g',C:'c',S:'s',E:'e',M:'m',X:'x',Y:'y',Z:'z',T:'tap',Q:'untap',P:'p' };
    if (named[s]) return `<i class="ms ms-${named[s]} ms-cost"></i>`;
    if (/^\d+$/.test(s)) return `<i class="ms ms-${s} ms-cost"></i>`;
    return `{${sym}}`;
}
 
// ---- Helpers ----
function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(str) {
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
}

//============================================================
// STATS
//============================================================

var statsLoaded = false;
 
var CHART_COLORS = [
    { key: 'White',        hex: '#c8a84b' },
    { key: 'Blue',         hex: '#1a7abf' },
    { key: 'Black',        hex: '#555555' },
    { key: 'Red',          hex: '#d3202a' },
    { key: 'Green',        hex: '#00733e' },
    { key: 'Multicolored', hex: '#c8963a' },
    { key: 'Artifact',     hex: '#8090a0' },
    { key: 'Land',         hex: '#a07850' },
    { key: 'Colorless',    hex: '#b0b0b0' },
];
 
function loadStats() {
    if (statsLoaded) return;
    statsLoaded = true;
    // Slight delay so the section is visible and has layout before D3 measures it
    requestAnimationFrame(function() {
        renderStatCards();
        renderManaCurve();
        renderColorDist();
    });
}
 
// ---- Stat cards ----
function renderStatCards() {
    var cards    = cubeData.cards.mainboard;
    var nonLands = cards.filter(function(c) {
        return !(c.details.type || '').toLowerCase().includes('land');
    });
    var avgCmc = nonLands.reduce(function(sum, c) {
        return sum + (c.details.cmc || 0);
    }, 0) / (nonLands.length || 1);
 
    var colorSet = new Set();
    cards.forEach(function(c) {
        (c.details.colors || []).forEach(function(col) { colorSet.add(col); });
    });
 
    var stats = [
        { value: cards.length,        label: 'Total Cards' },
        { value: avgCmc.toFixed(2),    label: 'Avg CMC' },
        { value: colorSet.size,        label: 'Colors' },
        { value: nonLands.length,      label: 'Non-Lands' },
    ];
 
    document.getElementById('stat-grid').innerHTML = stats.map(function(s) {
        return '<div class="stat-card">'
             + '<span class="stat-value">' + s.value + '</span>'
             + '<span class="stat-label">' + s.label + '</span>'
             + '</div>';
    }).join('');
}
 
// ---- Mana curve ----
function renderManaCurve() {
    var cards   = cubeData.cards.mainboard;
    var MAX_CMC = 7; // 7 = "7+"
 
    // Only non-land colors in the curve
    var curveColors = CHART_COLORS.filter(function(c) { return c.key !== 'Land'; });
 
    var data = curveColors.map(function(color) {
        var colorCards = cards.filter(function(c) {
            return c.details.colorcategory === color.key
                && !(c.details.type || '').toLowerCase().includes('land');
        });
        var counts = [];
        for (var i = 0; i <= MAX_CMC; i++) {
            var bucket = i;
            counts.push(colorCards.filter(function(c) {
                var cmc = Math.floor(c.details.cmc || 0);
                return bucket === MAX_CMC ? cmc >= MAX_CMC : cmc === bucket;
            }).length);
        }
        return { key: color.key, hex: color.hex, counts: counts };
    }).filter(function(d) {
        return d.counts.some(function(v) { return v > 0; });
    });
 
    var container = document.getElementById('chart-mana-curve');
    var margin    = { top: 20, right: 16, bottom: 36, left: 36 };
    var width     = container.clientWidth - margin.left - margin.right - 48;
    var height    = 220;
 
    var svg = d3.select('#svg-mana-curve')
        .attr('width',  width  + margin.left + margin.right)
        .attr('height', height + margin.top  + margin.bottom);
 
    var g = svg.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
 
    var xScale = d3.scaleLinear()
        .domain([0, MAX_CMC])
        .range([0, width]);
 
    var maxCount = d3.max(data, function(d) { return d3.max(d.counts); }) || 1;
    var yScale = d3.scaleLinear()
        .domain([0, maxCount])
        .range([height, 0])
        .nice();
 
    // Grid lines
    g.append('g')
        .attr('class', 'stats-grid-lines')
        .call(
            d3.axisLeft(yScale)
              .ticks(5)
              .tickSize(-width)
              .tickFormat('')
        )
        .call(function(axis) { axis.select('.domain').remove(); });
 
    // X axis
    g.append('g')
        .attr('transform', 'translate(0,' + height + ')')
        .attr('class', 'stats-axis')
        .call(
            d3.axisBottom(xScale)
              .ticks(MAX_CMC + 1)
              .tickFormat(function(d) { return d === MAX_CMC ? '7+' : d; })
        );
 
    // Y axis
    g.append('g')
        .attr('class', 'stats-axis')
        .call(d3.axisLeft(yScale).ticks(5));
 
    // Line generator
    var line = d3.line()
        .x(function(d, i) { return xScale(i); })
        .y(function(d)    { return yScale(d); })
        .curve(d3.curveCatmullRom.alpha(0.5));
 
    // Draw and animate each color line
    data.forEach(function(color, idx) {
        var path = g.append('path')
            .datum(color.counts)
            .attr('fill', 'none')
            .attr('stroke', color.hex)
            .attr('stroke-width', 2.5)
            .attr('stroke-linejoin', 'round')
            .attr('stroke-linecap', 'round')
            .attr('d', line);
 
        var totalLength = path.node().getTotalLength();
 
        path
            .attr('stroke-dasharray',  totalLength + ' ' + totalLength)
            .attr('stroke-dashoffset', totalLength)
            .transition()
            .duration(600)
            .delay(idx * 150)
            .ease(d3.easeQuadInOut)
            .attr('stroke-dashoffset', 0);
 
        // Dots fade in after the line finishes
        g.selectAll('.dot-' + idx)
            .data(color.counts)
            .enter().append('circle')
            .attr('cx', function(d, i) { return xScale(i); })
            .attr('cy', function(d)    { return yScale(d); })
            .attr('r', 3.5)
            .attr('fill', color.hex)
            .attr('stroke', 'var(--card-bg)')
            .attr('stroke-width', 1.5)
            .style('opacity', 0)
            .transition()
            .duration(200)
            .delay(function(d, i) { return idx * 150 + 550; })
            .style('opacity', function(d) { return d > 0 ? 1 : 0; });
    });
 
    // Legend
    document.getElementById('legend-mana-curve').innerHTML = data.map(function(c) {
        return '<span class="chart-legend-item">'
             + '<span class="chart-legend-dot" style="background:' + c.hex + '"></span>'
             + c.key
             + '</span>';
    }).join('');
}
 
// ---- Color distribution donut ----
function renderColorDist() {
    var cards  = cubeData.cards.mainboard;
    var counts = {};
    cards.forEach(function(c) {
        var cat = c.details.colorcategory || 'Colorless';
        counts[cat] = (counts[cat] || 0) + 1;
    });
 
    var data = CHART_COLORS
        .filter(function(c) { return counts[c.key] > 0; })
        .map(function(c) { return { key: c.key, hex: c.hex, count: counts[c.key] }; });
 
    var container   = document.getElementById('chart-color-dist');
    var size        = Math.min(container.clientWidth - 48, 260);
    var radius      = size / 2;
    var innerRadius = radius * 0.55;
 
    var svg = d3.select('#svg-color-dist')
        .attr('width',  size)
        .attr('height', size);
 
    var g = svg.append('g')
        .attr('transform', 'translate(' + (size / 2) + ',' + (size / 2) + ')');
 
    var pie = d3.pie()
        .value(function(d) { return d.count; })
        .sort(null)
        .padAngle(0.02);
 
    var arc = d3.arc()
        .innerRadius(innerRadius)
        .outerRadius(radius - 2);
 
    var arcHover = d3.arc()
        .innerRadius(innerRadius)
        .outerRadius(radius + 6);
 
    // Animate slices sweeping in clockwise
    g.selectAll('.arc')
        .data(pie(data))
        .enter().append('path')
        .attr('fill',         function(d) { return d.data.hex; })
        .attr('stroke',       'var(--card-bg)')
        .attr('stroke-width', 2)
        .each(function(d)    { this._current = { startAngle: d.startAngle, endAngle: d.startAngle }; })
        .on('mouseover', function(event, d) {
            d3.select(this).transition().duration(150).attr('d', arcHover);
        })
        .on('mouseout', function(event, d) {
            d3.select(this).transition().duration(150).attr('d', arc);
        })
        .transition()
        .duration(500)
        .delay(function(d, i) { return i * 40; })
        .ease(d3.easeQuadOut)
        .attrTween('d', function(d) {
            var i = d3.interpolate(this._current, d);
            this._current = i(1);
            return function(t) { return arc(i(t)); };
        });
 
    // Center text
    g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '-0.1em')
        .attr('class', 'donut-center-value')
        .text(cards.length);
 
    g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '1.3em')
        .attr('class', 'donut-center-label')
        .text('cards');
 
    // Legend
    document.getElementById('legend-color-dist').innerHTML = data.map(function(c) {
        return '<span class="chart-legend-item">'
             + '<span class="chart-legend-dot" style="background:' + c.hex + '"></span>'
             + c.key
             + '<span class="chart-legend-count">' + c.count + '</span>'
             + '</span>';
    }).join('');
}


//============================================================
// CARD REFERENCE
//============================================================

// ---- Reference state ----
var referenceLoaded  = false;
var referenceData    = {};   // { removal: [card,...], counterspell: [...], ... }
var activeCategory   = 'removal';
var activeColors     = new Set();
 
var COLOR_ORDER = ['White','Blue','Black','Red','Green','Multicolored','Colorless','Artifact','Land'];
var LETTER_TO_CATEGORY = { W:'White', U:'Blue', B:'Black', R:'Red', G:'Green' };
 
async function loadReference() {
    if (referenceLoaded) return;
 
    document.getElementById('reference-loading').classList.remove('hidden');
 
    try {
        var res  = await fetch('https://raw.githubusercontent.com/bernardodferreira/scryboard/main/data/otags.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var tags = await res.json();
 
        // Build name → card object map from cube mainboard
        var cardMap = new Map();
        cubeData.cards.mainboard.forEach(function(card) {
            cardMap.set(card.details.name, card);
        });
 
        // Intersect each otag list with the cube
        ['removal', 'counterspell', 'combat-tricks', 'sweeper'].forEach(function(tag) {
            var tagSet = new Set(tags[tag] || []);
            referenceData[tag] = cubeData.cards.mainboard.filter(function(card) {
                return tagSet.has(card.details.name);
            });
        });
 
        referenceLoaded = true;
        document.getElementById('reference-loading').classList.add('hidden');
        document.getElementById('reference-ui').classList.remove('hidden');
        renderReference();
 
    } catch(err) {
        console.error('[Reference]', err);
        document.getElementById('reference-loading').classList.add('hidden');
        document.getElementById('reference-error').classList.remove('hidden');
    }
}
 
function cardMatchesColors(card, selectedColors) {
    if (selectedColors.size === 0) return true;
 
    var category = card.details.colorcategory || '';
    var colors   = card.details.colors || [];
 
    // C button: artifacts, colorless, lands
    if (selectedColors.has('C') && ['Colorless','Artifact','Land'].includes(category)) {
        return true;
    }
 
    // WUBRG: any overlap between card colors and selection
    // If colors array is empty, derive from colorcategory
    var cardLetters = colors.length > 0
        ? colors
        : (LETTER_TO_CATEGORY[category] ? [] : []); // multicolor etc handled by colors array
 
    // For mono-color cards that store category instead of colors array
    if (colors.length === 0 && LETTER_TO_CATEGORY[category]) {
        var letter = Object.keys(LETTER_TO_CATEGORY).find(function(k) {
            return LETTER_TO_CATEGORY[k] === category;
        });
        if (letter) cardLetters = [letter];
    }
 
    return cardLetters.some(function(c) { return selectedColors.has(c); });
}
 
function renderReference() {
    var cards    = referenceData[activeCategory] || [];
    var gallery  = document.getElementById('reference-gallery');
    var countEl  = document.getElementById('reference-count');
 
    var filtered = cards.filter(function(card) {
        return cardMatchesColors(card, activeColors);
    });
 
    // Sort by color order then name
    filtered.sort(function(a, b) {
        var ai = COLOR_ORDER.indexOf(a.details.colorcategory);
        var bi = COLOR_ORDER.indexOf(b.details.colorcategory);
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return a.details.name.localeCompare(b.details.name);
    });
 
    countEl.textContent = filtered.length + ' card' + (filtered.length !== 1 ? 's' : '');
 
    if (filtered.length === 0) {
        gallery.innerHTML = '<p class="reference-empty">No cards match the selected filters.</p>';
        return;
    }
 
    gallery.innerHTML = filtered.map(function(card) {
        var src = card.details.image_normal ||
            ('https://api.scryfall.com/cards/named?format=image&exact=' + encodeURIComponent(card.details.name));
        return '<img class="reference-card card-ref"'
             + ' src="' + src + '"'
             + ' data-card="' + card.details.name + '"'
             + ' alt="' + card.details.name + '"'
             + ' loading="lazy">';
    }).join('');
}
 
// Category pills — single select
document.querySelectorAll('.ref-cat-pill').forEach(function(pill) {
    pill.addEventListener('click', function() {
        document.querySelectorAll('.ref-cat-pill').forEach(function(p) {
            p.classList.remove('active');
        });
        pill.classList.add('active');
        activeCategory = pill.dataset.cat;
        if (referenceLoaded) renderReference();
    });
});
 
// Color pills — multi select
document.querySelectorAll('.ref-color-pill').forEach(function(pill) {
    pill.addEventListener('click', function() {
        var color = pill.dataset.color;
        if (activeColors.has(color)) {
            activeColors.delete(color);
            pill.classList.remove('active');
        } else {
            activeColors.add(color);
            pill.classList.add('active');
        }
        if (referenceLoaded) renderReference();
    });
});

// ============================================================
// COMBOS
// ============================================================

var combosLoaded = false;
 
async function loadCombos() {
    if (combosLoaded) return;
 
    // Only works on the deployed Netlify site
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        document.getElementById('combos-error-msg').textContent =
            'Combos are only available on the deployed site — open it on Netlify to see them.';
        document.getElementById('combos-error').classList.remove('hidden');
        return;
    }
 
    document.getElementById('combos-loading').classList.remove('hidden');
 
    try {
        // Build a plain-text decklist from the cube mainboard
        var cardList = cubeData.cards.mainboard.map(function(c) {
            return '1 ' + c.details.name;
        }).join('\n');
 
        var res = await fetch('/.netlify/functions/combos', {
            method: 'POST',
            body: cardList
        });
 
        if (!res.ok) throw new Error('HTTP ' + res.status);
 
        var data = await res.json();
        if (data.error) throw new Error(data.error);
 
        var combos = (data.results && data.results.included) || [];
 
        // Sort by popularity descending
        combos.sort(function(a, b) { return (b.popularity || 0) - (a.popularity || 0); });
 
        combosLoaded = true;
        document.getElementById('combos-loading').classList.add('hidden');
        document.getElementById('combos-ui').classList.remove('hidden');
        renderCombos(combos);
 
    } catch(err) {
        console.error('[Combos]', err);
        document.getElementById('combos-loading').classList.add('hidden');
        document.getElementById('combos-error-msg').textContent = err.message;
        document.getElementById('combos-error').classList.remove('hidden');
    }
}
 
function renderCombos(combos) {
    var countEl = document.getElementById('combos-count');
    var listEl  = document.getElementById('combos-list');
 
    if (combos.length === 0) {
        countEl.textContent = '';
        listEl.innerHTML = '<p class="combos-empty">No combos found in this cube.</p>';
        return;
    }
 
    countEl.textContent = combos.length + ' combo' + (combos.length !== 1 ? 's' : '') + ' found';
 
    listEl.innerHTML = combos.map(function(combo, idx) {
        // Card names from uses[]
        var cardNames = (combo.uses || []).map(function(u) {
            return u.card && u.card.name ? u.card.name : null;
        }).filter(Boolean);
 
        // Results from produces[]
        var results = (combo.produces || []).map(function(p) {
            return p.feature && p.feature.name ? p.feature.name : null;
        }).filter(Boolean);
 
        // Steps from description (newline-separated)
        var steps = (combo.description || '').split('\n').map(function(s) {
            return s.trim();
        }).filter(Boolean);
 
        var prerequisites = (combo.easyPrerequisites || combo.notablePrerequisites || '').trim();
 
        var cardChips = cardNames.map(function(name) {
            return '<span class="card-ref combo-chip" data-card="' + name + '">' + name + '</span>';
        }).join('<span class="combo-plus">+</span>');
 
        var resultHtml = results.length
            ? '<p class="combo-result">' + results.join(' · ') + '</p>'
            : '';
 
        var prereqHtml = prerequisites
            ? '<p class="combo-prereq"><strong>Requires:</strong> ' + prerequisites + '</p>'
            : '';
 
        var stepsHtml = steps.length ? (
            '<button class="combo-steps-toggle" onclick="toggleComboSteps(this)">▶ Show steps</button>'
            + '<ol class="combo-steps hidden">'
            + steps.map(function(s) { return '<li>' + s + '</li>'; }).join('')
            + '</ol>'
        ) : '';
 
        return '<div class="combo-card">'
             + '<div class="combo-cards-line">' + cardChips + '</div>'
             + resultHtml
             + prereqHtml
             + stepsHtml
             + '</div>';
    }).join('');
}
 
function toggleComboSteps(btn) {
    var steps = btn.nextElementSibling;
    var hidden = steps.classList.toggle('hidden');
    btn.textContent = hidden ? '▶ Show steps' : '▼ Hide steps';
}

// ============================================================
// TABS
// ============================================================
document.querySelectorAll('.cube-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;

        document.querySelectorAll('.cube-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.cube-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`section-${target}`).classList.add('active');

        if (target === 'reference') loadReference();
        if (target === 'stats') loadStats();
        if (target === 'combos') loadCombos();
    });
});

// ============================================================
// COPY LINK
// ============================================================

function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        const btn = document.getElementById('copy-link-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = window.location.href;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    });
}

// ============================================================
// CARD TOOLTIP
// ============================================================

const tooltip = document.getElementById('card-tooltip');

document.addEventListener('mouseover', e => {
    const ref = e.target.closest('.card-ref');
    if (!ref || ref.tagName === 'IMG') return; // images show themselves; no tooltip needed
    const name = ref.dataset.card;
    if (!name) return;
    tooltip.src = `https://api.scryfall.com/cards/named?format=image&exact=${encodeURIComponent(name)}`;
    tooltip.style.display = 'block';
});

document.addEventListener('mousemove', e => {
    if (tooltip.style.display === 'block') {
        tooltip.style.left = `${e.clientX + 16}px`;
        tooltip.style.top  = `${Math.min(e.clientY - 20, window.innerHeight - 320)}px`;
    }
});

document.addEventListener('mouseout', e => {
    if (e.target.closest('.card-ref')) {
        tooltip.style.display = 'none';
        tooltip.src = '';
    }
});

// ============================================================
// GO
// ============================================================

init();
