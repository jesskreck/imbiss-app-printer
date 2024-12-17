const fs = require('fs');
const path = require('path');

const orderCounterFile = path.join(__dirname, 'orderCounter.json');
const initialData = {
    date: new Date().toISOString().split('T')[0], // Aktuelles Datum
    orderNumber: 1,
};

// Hilfsfunktion zum Lesen der aktuellen Bestellnummer
function readOrderCounter() {
  try {
    const data = fs.readFileSync(orderCounterFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    fs.writeFileSync(orderCounterFile, JSON.stringify(initialData, null, 2));
    return initialData;
  }
}

// Hilfsfunktion zum Initialisieren des Order Counters beim Start
function initializeOrderCounter() {
  const currentDate = new Date().toISOString().split('T')[0];
  let data = readOrderCounter();

  // Überprüfen, ob das gespeicherte Datum nicht aktuell ist
  if (data.date !== currentDate) {
    data = { date: currentDate, orderNumber: 1 };
    fs.writeFileSync(orderCounterFile, JSON.stringify(data, null, 2));
  }
}

// Hilfsfunktion zum Hochzählen der Bestellnummer
function incrementOrderNumber() {
  const currentDate = new Date().toISOString().split('T')[0];
  let data = readOrderCounter();

  if (data.date !== currentDate) {
    data = { date: currentDate, orderNumber: 1 };
  } else {
    data.orderNumber += 1;
  }

  fs.writeFileSync(orderCounterFile, JSON.stringify(data, null, 2));
}

module.exports = { readOrderCounter, initializeOrderCounter, incrementOrderNumber };
