import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';

// Reads the real stylesheet, so a token change that breaks contrast fails here before anyone sees it.
const css=fs.readFileSync(new URL('../web/src/index.css',import.meta.url),'utf8');
const vars=block=>Object.fromEntries([...block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(m=>[m[1],m[2].toLowerCase()]));
const light=vars(css.slice(css.indexOf('@theme {'),css.indexOf('/* Dark theme')));
const darkMedia=vars(css.slice(css.indexOf('@media (prefers-color-scheme: dark)'),css.indexOf(':root[data-theme="dark"]')));
const darkAttr=vars(css.slice(css.indexOf(':root[data-theme="dark"]')));
const lum=hex=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*r+0.7152*g+0.0722*b;};
const ratio=(a,b)=>{const [hi,lo]=[lum(a),lum(b)].sort((x,y)=>y-x);return (hi+0.05)/(lo+0.05);};

const TEXT_PAIRS=[['ink','bg'],['ink','surface'],['ink','muted-surface'],['muted','bg'],['muted','surface'],['muted','muted-surface'],['faint','bg'],['faint','surface'],['faint','muted-surface'],
  ['brand','surface'],['brand','bg'],['brand','brand-soft'],['on-brand','brand'],['success','surface'],['success','success-soft'],['warning','surface'],['warning','warning-soft'],['danger','surface'],['danger','danger-soft'],['info','surface'],['info','info-soft']];
const UI_PAIRS=[['control','surface'],['control','bg'],['focus','surface'],['focus','bg'],['focus','muted-surface']];

for(const [name,theme] of [['light',light],['dark',{...light,...darkAttr}]]){
  test(`${name} theme: every text colour pair reaches 4.5:1`,()=>{
    for(const [fg,bg] of TEXT_PAIRS){assert.ok(theme[fg]&&theme[bg],`${fg}/${bg} defined`);assert.ok(ratio(theme[fg],theme[bg])>=4.5,`${fg} ${theme[fg]} on ${bg} ${theme[bg]} is ${ratio(theme[fg],theme[bg]).toFixed(2)}:1`);}
  });
  test(`${name} theme: control borders and the focus ring reach 3:1`,()=>{
    for(const [fg,bg] of UI_PAIRS)assert.ok(ratio(theme[fg],theme[bg])>=3,`${fg} on ${bg} is ${ratio(theme[fg],theme[bg]).toFixed(2)}:1`);
  });
}
test('the system dark theme and the chosen dark theme use identical colours',()=>{
  assert.deepEqual(darkMedia,darkAttr);assert.ok(Object.keys(darkAttr).length>=20);
});
test('the token set defines the type scale, elevation, spacing base, motion and focus ring',()=>{
  for(const token of ['--text-xs','--text-sm','--text-base','--text-lg','--text-xl','--text-2xl','--shadow-sm','--shadow-md','--shadow-lg','--spacing','--radius-control','--radius-card','--duration-base','--focus-ring-width'])assert.ok(css.includes(token+':'),token);
  const sizes=[...css.matchAll(/--text-(xs|sm|base|lg|xl|2xl):\s*(\d+)px/g)].map(m=>Number(m[2]));
  assert.ok(Math.min(...sizes)>=12,'nothing smaller than 12px');
});
test('reduced motion turns animation and transitions off',()=>{assert.match(css,/prefers-reduced-motion: reduce[\s\S]*animation: none[\s\S]*transition: none/);});
test('no screen hard-codes white or black fills that would break the dark theme',()=>{
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
  for(const file of walk(new URL('../web/src',import.meta.url).pathname).filter(f=>/\.tsx$/.test(f))){
    const src=fs.readFileSync(file,'utf8');
    assert.ok(!/-\[#[0-9a-f]{3,8}\]/i.test(src),`${file} hard-codes a hex colour: use a token`);
    assert.ok(!/\b(?:bg-white|text-white|text-black|bg-black(?!\/))/.test(src),`${file} uses a fixed white or black (dim scrims like bg-black/30 are fine)`);
  }
});
