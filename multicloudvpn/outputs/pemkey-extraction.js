const fs = require('fs');

/*
 Script for private key file extraction
*/

const jsonFilePath = 'outputs.json';
const pemFilePath = 'ssh_private_key.pem';

const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
const privateKey = jsonData.app.ssh_private_key_output;
const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

fs.writeFileSync(pemFilePath, formattedPrivateKey);
console.log(`PEM save done: ${pemFilePath}`);
