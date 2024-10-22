const fs = require('fs');
const path = require('path');

function saveOrderToJSON(order) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filePath = path.join(__dirname, `./umsatzlisten/umsatz-${date}.json`);

    fs.readFile(filePath, 'utf8', (err, data) => {
        let jsonData = [];

        if (!err && data) {
            jsonData = JSON.parse(data); // Existierende Daten parsen
        }

        jsonData.push(order); // Neue Bestellung hinzufügen

        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), (err) => {
            if (err) {
                console.error('Fehler beim Schreiben der Datei:', err);
            } else {
                console.log('Bestellung erfolgreich in der Umsatzdatei gespeichert.');
            }
        });
    });
}

module.exports = { saveOrderToJSON };
