'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
global.window = {};
require(path.join(root, 'themes/jingzhe_v3/assets/js/zouguo/model.js'));

const payload = {
  items: [
    {
      id: 'post:new',
      occurredAt: '2026-08-20T09:30:00+08:00',
      summary: '新的记录',
      source: { type: 'post' },
      place: {
        id: 'place:one',
        name: '同一地点',
        region: '湖北',
        locality: '武汉',
        countryCode: 'CN',
        longitude: 114.3,
        latitude: 30.5
      },
      images: ['/new.jpg']
    },
    {
      id: 'laodao:old',
      occurredAt: '2025-03-02T10:00:00+08:00',
      text: '旧的记录',
      source: { type: 'laodao' },
      place: {
        id: 'place:one',
        name: '同一地点',
        region: '湖北',
        locality: '武汉',
        longitude: 114.3,
        latitude: 30.5
      },
      images: [{ original: '/old.jpg', thumb: '/old-thumb.jpg' }]
    }
  ]
};

const model = window.JingzheZouguoModules.createModel(payload, '2026');
assert.equal(model.items.length, 2);
assert.equal(model.locations.length, 1);
assert.deepEqual(model.locations[0].items.map(item => item.id), ['post:new', 'laodao:old']);
assert.equal(model.itemsById.get('post:new').dateLabel, '08-20');
assert.equal(model.itemsById.get('laodao:old').dateLabel, '2025-03-02');
assert.equal(model.itemsById.get('post:new').areaLabel, '湖北 · 武汉');
assert.equal(model.itemLocationIds.get('post:new'), 'place:one');
assert.equal(model.imageSource(model.itemsById.get('post:new').images[0], 'thumb'), '/new.jpg');
assert.equal(model.sourceLabelForItem(model.itemsById.get('post:new')), '来自随笔');
assert.equal(model.sourceLabelForItem(model.itemsById.get('laodao:old')), '来自唠叨');

console.log('zouguo model: ok');
