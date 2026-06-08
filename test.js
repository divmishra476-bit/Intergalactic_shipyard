const fs = require('fs');

// Mock window
global.window = {};

// Load normalizer
const normalizerCode = fs.readFileSync('./data-normalizer.js', 'utf8');
eval(normalizerCode);

const https = require('https');
https.get('https://task1-nsaic.vercel.app/api/ships', (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const raw = JSON.parse(data);
    const normalized = window.DataNormalizer.normalizeShipData(raw);
    console.log(JSON.stringify(normalized, null, 2));
    
    const alerts = normalized.filter(s => s.isCriticalAlert);
    console.log(`\nFound ${alerts.length} alerts.`);
    alerts.forEach(s => console.log(`- ${s.name} (Cap: ${s.capacity}, Core: ${s.coreType})`));
  });
});
