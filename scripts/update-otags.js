'use strict';

const fs   = require('fs');
const path = require('path');

const TAGS     = ['removal', 'counterspell', 'combat-tricks', 'sweeper'];
const OUT      = path.join(__dirname, '..', 'data', 'otags.json');
const DELAY_MS = 350;

const HEADERS = {
    'User-Agent': 'Scryboard/1.0 (cube drafter companion; github.com/bernardodferreira/scryboard)',
    'Accept': 'application/json'
};

function sleep(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

async function fetchPage(url, attempt) {
    attempt = attempt || 1;

    var res = await fetch(url, { headers: HEADERS });

    if (res.status === 429) {
        var wait = attempt * 2000;
        console.log('  Rate limited. Waiting ' + (wait / 1000) + 's before retry...');
        await sleep(wait);
        return fetchPage(url, attempt + 1);
    }

    return res;
}

async function fetchTag(tag) {
    var names = [];
    var url   = 'https://api.scryfall.com/cards/search?q=otag%3A' + encodeURIComponent(tag) + '&unique=oracle';
    var page  = 1;

    while (url) {
        var res = await fetchPage(url);

        if (res.status === 404) {
            console.log('  [' + tag + '] no results.');
            break;
        }

        if (!res.ok) {
            var body = await res.text();
            throw new Error('[' + tag + '] HTTP ' + res.status + ' — ' + body.slice(0, 200));
        }

        var data = await res.json();

        data.data.forEach(function(card) { names.push(card.name); });
        console.log('  [' + tag + '] page ' + page + ': ' + data.data.length + ' cards (total: ' + names.length + ')');

        url = data.has_more ? data.next_page : null;
        page++;

        if (url) { await sleep(DELAY_MS); }
    }

    return Array.from(new Set(names)).sort();
}

async function main() {
    console.log('=== Scryboard OTag updater ===');

    var result = {
        generated: new Date().toISOString().split('T')[0]
    };

    for (var i = 0; i < TAGS.length; i++) {
        var tag = TAGS[i];
        console.log('\nFetching otag:' + tag + '...');
        result[tag] = await fetchTag(tag);
        console.log('  -> ' + result[tag].length + ' cards');
        await sleep(DELAY_MS * 2);
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n', 'utf8');
    console.log('\nDone. Written to ' + OUT);
}

main().catch(function(err) {
    console.error('Failed:', err.message);
    process.exit(1);
});
