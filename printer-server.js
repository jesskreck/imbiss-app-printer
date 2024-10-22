const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const escpos = require('escpos');
const { command } = escpos;


const { readOrderCounter, incrementOrderNumber } = require('./orderCounter');
const { saveOrderToJSON } = require('./orderFileStorage');

escpos.USB = require('escpos-usb');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());


// Endpunkt für aktuelle Bestellnummer
app.get('/order-number', (req, res) => {
    const data = readOrderCounter();
    res.json({ orderNumber: data.orderNumber });
});


//////////////////////////////////////////////////////////////////// HILFSFUNKTIONEN ////////////////////////////////////////////////////////////////////

function formatTime(date) {
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function formatDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Monate von 0 bis 11, daher +1
    const year = today.getFullYear();

    return `${day}.${month}.${year}`;
}


function formatDateTime(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}.${month}.${year} ${hours}:${minutes}`;
}


function formatSpeisen(speisen) {
    return speisen.map((item) => {
        const { menge, speise, gesamtpreis, size, notiz } = item;
        const { nr, name, zutaten, option, sauce } = speise;

        // Bereite die Zutatenliste als einzelnen String vor, nur wenn Menge > 0
        const zutatenListe = Array.isArray(zutaten)
            ? zutaten
                .filter((zutat) => zutat.menge > 0) // Filtere Zutaten mit Menge = 0 heraus
                .map((zutat) => `${zutat.menge > 1 ? `${zutat.menge}x ` : ''}${zutat.name}`) // Zeige Menge nur an, wenn > 1
                .join(', ')
            : '';

        const optionListe = Array.isArray(option)
            ? option
                .filter((o) => o.menge > 0) // Filtere Zutaten mit Menge = 0 heraus
                .map((o) => `${o.menge > 1 ? `${o.menge}x ` : ''}${o.name}`) // Zeige Menge nur an, wenn > 1
                .join(', ')
            : '';

        const sauceListe = Array.isArray(sauce)
            ? sauce
                .filter((s) => s.menge > 0) // Filtere Saucen mit Menge = 0 heraus
                .map((s) => `${s.menge > 1 ? `${s.menge}x ` : ''}${s.name}`) // Zeige Menge nur an, wenn > 1
                .join(', ')
            : '';

        // Kombiniere Zutaten und Saucen
        const gesamtListe = zutatenListe + (optionListe ? `, ${optionListe}` : '') + (sauceListe ? `, ${sauceListe}` : '');

        return {
            menge,
            nr,
            name,
            size,
            zutatenListe: gesamtListe,
            gesamtpreis,
            notiz
        };
    });
}

function formatLieferung(bestellung) {
    const { name, telefon, strasse, hausnummer, liefernotiz } = bestellung;

    let lieferDetails = {
        name: name || '',
        telefon: telefon || '',
        adresse: '',
        hinweis: liefernotiz || ''
    };

    // Überprüfen, ob es ein Komma in der Straße gibt und die Hausnummer vorhanden ist
    if (strasse && hausnummer) {
        const [strassenName, plz] = strasse.split(','); // Straße und Postleitzahl trennen
        lieferDetails.adresse = `${strassenName.trim()} ${hausnummer.trim()}, ${plz.trim()}`;
    } else if (strasse) {
        lieferDetails.adresse = strasse;
    }

    return lieferDetails;
}


//////////////////////////////////////////////////////////////////// AUSDRUCK BESTELLUNGEN ////////////////////////////////////////////////////////////////////


app.post('/print', (req, res) => {
    try {
        // Daten abfangen
        console.log('Eingehende Bestellung:', req.body);
        const { auswahl, bestellung } = req.body;
        const { nr, speisen, gesamtpreis, eingangszeit, abholzeit } = bestellung;

        // Daten formatieren
        console.log("vorher:", speisen);
        const formattedSpeisen = formatSpeisen(speisen);
        console.log("formatiert:", formattedSpeisen);
        const eingang = formatTime(new Date(eingangszeit));
        const abhol = formatTime(new Date(abholzeit));
        const summe = gesamtpreis.toFixed(2);

        // Daten aufbereiten falls Lieferung
        let lieferDetails = '';
        if (auswahl !== 'vor Ort') {
            lieferDetails = formatLieferung(bestellung);
        }

        // Daten in JSON Umsatzlisten abspeichern
        saveOrderToJSON({ auswahl, bestellung, timestamp: new Date().toISOString() });

        // Drucken
        const device = new escpos.USB();
        const options = { encoding: 'CP437' };
        const printer = new escpos.Printer(device, options);

        device.open((error) => {
            if (error) {
                console.error('Error opening device:', error);
                return res.status(500).json({ success: false, error: error.message });
            }

            printer
                .style('normal')
                .font("A")

                .feed(5)
                .align("CT")
                .size(1, 1)
                .text(`${auswahl} Nr.${nr}`)
                .feed(2)
                .size(0.5, 0.5)
                .text("********************************")
            if (eingang === abhol) {
                printer.text('sofort');
            } else {
                printer.text(`von: ${eingang} Uhr`)
                    .text(`zu: ${abhol} Uhr`);
            }

            printer
                .text("********************************")
                .feed(1)

                .align("LT")

            formattedSpeisen.forEach((speise) => {
                printer
                    .size(0.5, 0.5)
                    .text(`${speise.menge}x Nr.${speise.nr}`)
                    .size(0.7, 0.7)
                    .text(`${speise.size === "klein" ? `${command.TEXT_FORMAT.TXT_UNDERL2_ON}${speise.size}${command.TEXT_FORMAT.TXT_UNDERL_OFF} ` : ""}${speise.name}`)
                    .size(0.5, 0.5)
                    .text(speise.zutatenListe)
                    .text(speise.notiz ? `${command.TEXT_FORMAT.TXT_UNDERL2_ON}HINWEIS: ${speise.notiz}${command.TEXT_FORMAT.TXT_UNDERL_OFF}` : "")
                    .text(`${speise.gesamtpreis.toFixed(2)} EUR`)
                    .feed(2)

            });


            printer
                .feed(1)
                .align("CT")
                .size(0.7, 0.7)
                .text(`Total: ${summe} EUR`)
                .feed(2)

            if (lieferDetails) {
                printer.
                    feed(1).align("LT")
                if (lieferDetails.name) {
                    printer
                        .size(0.5, 0.5).text("Name:")
                        .size(0.7, 0.7).text(lieferDetails.name)
                }
                if (lieferDetails.telefon) {
                    printer
                        .size(0.5, 0.5).text("Telefon:")
                }
                printer
                    .size(0.7, 0.7).text(lieferDetails.telefon)
                    .size(0.5, 0.5).text("Strasse:")
                    .size(0.7, 0.7).text(lieferDetails.adresse)
                if (lieferDetails.hinweis) {
                    printer
                        .size(0.5, 0.5).text("Hinweis:")
                        .size(0.7, 0.7).text(lieferDetails.hinweis)
                }
            }

            printer
                .feed(2)
                .cut()
                .close();

            incrementOrderNumber();

            res.json({ success: true });
        });
    } catch (error) {
        console.error('Error in printReceipt:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

//////////////////////////////////////////////////////////////////// TAGESUMSATZ ////////////////////////////////////////////////////////////////////

app.get('/print-tagesumsatz', (req, res) => {
    try {
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filePath = path.join(__dirname, `./umsatzlisten/umsatz-${date}.json`);

        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Fehler beim Laden der Umsatzdaten' });
            }

            const jsonData = JSON.parse(data);
            const totalUmsatz = jsonData.reduce((acc, order) => acc + order.bestellung.gesamtpreis, 0);

            const orderCounts = jsonData.reduce(
                (counts, order) => {
                    if (order.auswahl === 'vor Ort') counts.vorOrt += 1;
                    else if (order.auswahl === 'Abholung') counts.abholung += 1;
                    else if (order.auswahl === 'Lieferung') counts.lieferung += 1;
                    return counts;
                },
                { vorOrt: 0, abholung: 0, lieferung: 0 }
            );

            const totalOrders = orderCounts.vorOrt + orderCounts.abholung + orderCounts.lieferung;

            // Umsatzverteilung berechnen
            const percentVorOrt = ((orderCounts.vorOrt / totalOrders) * 100).toFixed(0);
            const percentAbholung = ((orderCounts.abholung / totalOrders) * 100).toFixed(0);
            const percentLieferung = ((orderCounts.lieferung / totalOrders) * 100).toFixed(0);

            // Erste und letzte Bestellung für den Quality Check
            const firstOrderTime = formatDateTime(new Date(new Date(jsonData[0].bestellung.eingangszeit)));
            const lastOrderTime = formatDateTime(new Date(new Date(jsonData[jsonData.length - 1].bestellung.eingangszeit)));

            const currentTime = formatTime(new Date());
            const formattedDate = formatDate(date);

            // Drucken
            const device = new escpos.USB();
            const options = { encoding: 'CP437' };
            const printer = new escpos.Printer(device, options);

            device.open((error) => {
                if (error) {
                    return res.status(500).json({ success: false, error: error.message });
                }

                printer
                    .align('CT')
                    .size(0.5, 0.5).text("********************************")
                    .size(1, 1).text("Tagesumsatz")
                    .size(0.7, 0.7).text(formattedDate)
                    .size(0.5, 0.5).text(`Stand: ${currentTime} Uhr`)
                    .text("********************************")
                    .feed(1)
                    .align('LT')
                    .feed(1)
                    .text(`Umsatz: ${totalUmsatz.toFixed(2)} EUR`)
                    .feed(1)
                    .text('Gesamt: ' + totalOrders + ' Bestellungen')
                    .text('===============================')
                    .text(`Vor Ort: ${orderCounts.vorOrt}`)
                    .text(`Abholung: ${orderCounts.abholung}`)
                    .text(`Lieferung: ${orderCounts.lieferung}`)
                    .feed(1)
                    .text('Umsatzverteilung')
                    .text('===============================')
                    .text(`Vor Ort: ${percentVorOrt}%`)
                    .text(`Abholung: ${percentAbholung}%`)
                    .text(`Lieferung: ${percentLieferung}%`)
                    .feed(1)
                    .text('Vollständigkeitscheck')
                    .text('===============================')
                    .text(`Erste Bestellung: \n ${firstOrderTime} Uhr`)
                    .text(`Letzte Bestellung: \n ${lastOrderTime} Uhr`)
                    .feed(2)
                    .cut()
                    .close();

                res.json({ success: true });
            });
        });
    } catch (error) {
        console.error('Error in printReceipt:', error);
        res.status(500).json({ success: false, message: 'Fehler beim Drucken des Tagesumsatzes' });
    }
});

//////////////////////////////////////////////////////////////////// TAGESBERICHT ////////////////////////////////////////////////////////////////////


app.get('/print-tagesbericht', (req, res) => {
    try {
        const filePath = path.join(__dirname, `./umsatzlisten/umsatz-${new Date().toISOString().split('T')[0]}.json`);

        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Fehler beim Lesen der Umsatzdatei.' });
            }

            const bestellungen = JSON.parse(data);
            const speisenMap = {};

            // Iteriere über alle Bestellungen und Speisen, um die Anzahl zu zählen
            bestellungen.forEach((bestellung) => {
                bestellung.bestellung.speisen.forEach((speiseBestellt) => {
                    const speiseNr = speiseBestellt.speise.nr;
                    if (!speisenMap[speiseNr]) {
                        speisenMap[speiseNr] = 0;
                    }
                    speisenMap[speiseNr] += speiseBestellt.menge;
                });
            });

            // Sortiere die Speisen nach der Anzahl
            const sortierteSpeisen = Object.entries(speisenMap).sort((a, b) => b[1] - a[1]);

            const reportLines = sortierteSpeisen.map(([speiseNr, menge]) => `Nr.${speiseNr}: ${menge}x`).join('\n');

            const now = new Date();
            const firstOrderTime = formatDateTime(new Date(new Date(bestellungen[0].bestellung.eingangszeit)));
            const lastOrderTime = formatDateTime(new Date(new Date(bestellungen[bestellungen.length - 1].bestellung.eingangszeit)));
            const reportTime = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
            const reportDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

            // Sende den Bericht an den Drucker
            const device = new escpos.USB();
            const options = { encoding: 'CP437' };
            const printer = new escpos.Printer(device, options);

            device.open((error) => {
                if (error) {
                    console.error('Error opening device:', error);
                    return res.status(500).json({ success: false, error: error.message });
                }

                printer

                    .align('CT')
                    .size(0.5, 0.5).text("********************************")
                    .size(1, 1).text("Tagesbericht")
                    .size(0.7, 0.7).text(reportDate)
                    .size(0.5, 0.5).text(`Stand: ${reportTime} Uhr`)
                    .text("********************************")
                    .feed(1)
                    .align('LT')
                    .text("Speise Charts")
                    .text('===============================')
                    .text(reportLines)
                    .feed(2)
                    .text('Vollständigkeitscheck')
                    .text('===============================')
                    .text(`Erste Bestellung: \n ${firstOrderTime} Uhr`)
                    .text(`Letzte Bestellung: \n ${lastOrderTime} Uhr`)
                    .feed(2)
                    .cut()
                    .close();

                res.json({ success: true });
            });
        });
    } catch (error) {
        console.error('Error in printTagesbericht:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.listen(port, () => {
    console.log(`Printer server is running on port ${port}`);
});