import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [editor, picker, row, result, routeCard, timeline, styles] = await Promise.all([
  read('../src/components/PlaceTimeEditor.jsx'),
  read('../src/screens/PlacePicker.jsx'),
  read('../src/components/SortablePlaceRow.jsx'),
  read('../src/screens/Result.jsx'),
  read('../src/components/RouteCard.jsx'),
  read('../src/components/Timeline.jsx'),
  read('../src/styles.css'),
]);

assert.match(editor, /import TimeWheel/);
assert.ok((editor.match(/<TimeWheel/g) ?? []).length >= 4,
  'business and visit times reuse the setup time wheel');
assert.doesNotMatch(editor, /type="time"/);
assert.match(editor, /updatePlace\(code, place\.id, patch\)/,
  'the shared editor still updates only its selected place');
assert.match(picker, /expanded=\{/);
assert.match(row, /className="item-expand"/);
assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.item-expand\s*\{[\s\S]*?position:\s*fixed/);
assert.match(styles, /\.item-expand \{[\s\S]*?border-top:/,
  'desktop keeps the editor inline under its row');

assert.match(result, /room\.transportMode === 'car'/);
assert.match(result, /통행료.*없음/);
assert.match(routeCard, /return \{ label: '통행료'/);
assert.match(timeline, /item\.mode === 'car' \? '통행료 '/);
assert.doesNotMatch(result, /기름|연료|운영비/);

console.log('Responsive place-time editor and car toll presentation checks passed');
