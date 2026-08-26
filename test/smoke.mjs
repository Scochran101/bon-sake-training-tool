// Smoke test for the Bon Sake training app.
//
// The app is a single HTML file with no build step, so the highest-value
// automated check is: does every script block parse, does the page boot in a
// DOM, and do the pure helper functions still behave? A syntax error or a
// broken helper can never reach Vercel again once this gates every push.
//
// Run locally or in CI:  npm i jsdom --no-save && node test/smoke.mjs

import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let failures = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log('  PASS ' + name); }
  else { failures++; console.error('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
};

// ---- 1) Every inline <script> block must parse ----------------------------
console.log('1) Script blocks parse');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok('found script blocks', blocks.length >= 2, 'got ' + blocks.length);
blocks.forEach((src, i) => {
  try { new Function(src); ok('block ' + i + ' parses', true); }
  catch (e) { ok('block ' + i + ' parses', false, e.message); }
});

// ---- 2) The page boots in a DOM -------------------------------------------
console.log('2) Page boots');
const virtualConsole = new VirtualConsole();       // swallow expected no-network noise
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://bonsake.test/',
  virtualConsole,
  beforeParse(window) {
    window.tailwind = {};                                          // CDN script doesn't load in CI
    window.fetch = () => Promise.reject(new Error('no network in CI'));
    window.AbortController = window.AbortController || class { constructor(){ this.signal = {}; } abort(){} };
  }
});
const w = dom.window;
await new Promise(r => setTimeout(r, 50));   // let DOMContentLoaded handlers settle

const mustExist = [
  'doLogin','enterApp','switchTab','apiGet','apiPost','apiSend','fetchJson',
  'outboxAdd','flushOutbox','toast','updateOnlineUI','reportError',
  'appConfirm','appAlert','appPrompt',
  'applyMenuPayload','menuCacheLoad','menuCacheSave','tryOfflineLogin',
  'flashcards','upsells','buildStudyListHtml','studySearch',
  'canonicalizeMenu','titleIngredient','matchRecall','esc','shuffle',
  'accBox','renderDutySplit','renderDutyTeamPicker','renderDutySection',
  'dutyBegin','dutyCounts','dutyToggle','listRoomHint','tableRoomOf',
  'isAdmin','userRoles','renderTeamProgress','drawTeamProgress','dutyEditorHtml',
  'dutyEditOpen','dutyEditSave','teamCacheLoad','adminToggleLb',
  'sectionCardLabel','wineTypeOf','wineTypes','renderWineTypes','studyBackToGroups',
  'doLoginByPin','finishLogin','afterLogin','showPinChange','submitNewPin','tryOfflineLoginByPin','showLoginNames',
  'renderDutyEditorFS','dutyEditClose','dutyDragStart','dutyDragMove','dutyDragEnd',
  'progressBoardsHtml','loadProgressBoards','fillProgressBoards',
  'isTrainerUser','shiftPlanFor','trShiftChips','trShift','startCloseout','coPickRating','submitCloseout',
  'loadTraineeBoard','fillTraineeBoard','openTrainee','trTrainee','soPickShift','soToggle',
  'submitShiftSignoff','trRecordCheck','trTrainerRef'
];
mustExist.forEach(f => ok(f + ' defined', typeof w[f] === 'function', typeof w[f]));

// ---- 3) Pure helpers behave -----------------------------------------------
console.log('3) Helpers behave');
ok('esc escapes html', w.esc('<b>&"\'') === '&lt;b&gt;&amp;&quot;&#39;', w.esc('<b>&"\''));
ok('flashcards fallback = 14', w.flashcards().length === 14, w.flashcards().length);
ok('upsells fallback = 10', w.upsells().length === 10, w.upsells().length);
ok('shuffle keeps items', w.shuffle([1,2,3,4]).sort().join() === '1,2,3,4');

// S is a script-level const (a global lexical binding, not a window property),
// so state-touching checks run through window.eval where it is in scope.
const listCounts = w.eval(`(() => {
  S.menu = [
    { item_id:'a1', item_name:'Dragon Roll', section:'Signature Maki', price:15, ingredients:['eel','avocado'] },
    { item_id:'a2', item_name:'Miso Soup', section:'Soup & Salad', price:4, ingredients:['miso','tofu'] }
  ];
  S.study = { section:'All Items', itemId:null, showDetailMobile:false, query:'' };
  const all = (buildStudyListHtml(sectionItems('All Items')).match(/<button/g)||[]).length;
  S.study.query = 'tofu';
  const filtered = (buildStudyListHtml(sectionItems('All Items')).match(/<button/g)||[]).length;
  return { all, filtered };
})()`);
ok('study list shows all', listCounts.all === 2, JSON.stringify(listCounts));
ok('study search filters', listCounts.filtered === 1, JSON.stringify(listCounts));

// outbox round trip
w.localStorage.removeItem('bonsake_outbox');
w.outboxAdd({ action:'test' }, 'ci');
ok('outbox persists', JSON.parse(w.localStorage.getItem('bonsake_outbox')).length === 1);

// ---- 4) Stylesheet coverage + old-browser guard ---------------------------
// The app ships a pre-built stylesheet (styles.css). If index.html gains a
// style class the stylesheet doesn't contain, this fails the build: the fix
// is to regenerate via tools/regen-styles.html and commit the result.
console.log('4) Stylesheet coverage and old-browser guard');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const classAttrs = [...html.matchAll(/class="([^"]*)"/g)].map(m => m[1]).join(' ');
const listCalls = [...html.matchAll(/classList\.(?:add|remove|toggle)\(([^)]*)\)/g)]
  .map(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).join(' ')).join(' ');
const clsTokens = [...new Set((classAttrs + ' ' + listCalls).split(/\s+/))]
  .map(t => t.replace(/\$\{[^}]*\}/g, '').trim())
  .filter(t => t && /^[a-zA-Z0-9:\[\]\/.#%-]+$/.test(t) && /[a-z]/.test(t));
// The app's own hand-written classes live in index.html's <style>, not styles.css.
const OWN = ['pin-mask','flip-card','flip-inner','flip-face','flip-back','flipped','fade-in','spin','no-scrollbar',
  'tp-sel','tbl-pulse','dragging','acc','acc-chev','floorTile','floorMark','hidden','tabBtn','dtTable',
  'drRoom','tpTable','mcqOpt','saOpt','qpOpt','wbSlot','rcSlot','tpChip','wbChip','addJob'];
const cssEscape = t => t.replace(/[:\[\]/.#%]/g, c => '\\' + c);
const missingCls = clsTokens.filter(t =>
  OWN.indexOf(t) === -1 && css.indexOf('.' + cssEscape(t)) === -1);
ok('every style class exists in styles.css', missingCls.length === 0, missingCls.slice(0, 12).join(' '));
// Compatibility floor: the app supports browsers as old as a 2013 iPad
// (iOS 12), which predates optional chaining and nullish coalescing.
ok('no optional chaining (?.)', !/[\w)\]]\?\.[\w[$]/.test(html));
ok('no nullish coalescing (??)', html.indexOf('??') === -1);

console.log(failures ? failures + ' FAILURE(S)' : 'All checks passed');
process.exit(failures ? 1 : 0);
