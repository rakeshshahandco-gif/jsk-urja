const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../..');
const be = fs.readFileSync(path.join(root, 'backend/src/constants/itemMasterTemplateFields.constants.js'), 'utf8');
const fb = be.slice(be.indexOf('export const ITEM_MASTER'), be.indexOf('export const ITEM_TEMPLATE'));
const ctrl = fs.readFileSync(path.join(__dirname, 'itemFieldControlSnippet.js'), 'utf8');
const content = '/** Phase 4 - item template fields */\n' + fb + ctrl;
fs.writeFileSync(path.join(root, 'src/constants/itemMasterTemplateFields.js'), content, 'utf8');
console.log('ok', content.split('\n').length);
