exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Step 1: Parse the plain text card list into CSB format
        const parseRes = await fetch('https://backend.commanderspellbook.com/card-list-from-text', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: event.body
        });

        if (!parseRes.ok) {
            throw new Error('card-list-from-text failed: ' + parseRes.status);
        }

        const cardList = await parseRes.json();

        // Step 2: Find combos using the parsed card list
        const comboRes = await fetch('https://backend.commanderspellbook.com/find-my-combos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cardList)
        });

        if (!comboRes.ok) {
            throw new Error('find-my-combos failed: ' + comboRes.status);
        }

        const data = await comboRes.json();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(data)
        };

    } catch(err) {
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: err.message })
        };
    }
};
