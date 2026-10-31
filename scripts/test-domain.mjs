import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,sampleBrief,totals} from '../lib/scopio.ts';
test('excluded authentication request quotes the exclusion',()=>{const r=analyze('Can we also add Google login?',sampleBrief);assert.equal(r.signal,'Potential addition');assert.match(r.excerpt,/not included/)});
test('design revisions match the recorded deliverable',()=>{assert.equal(analyze('Update the colors and typography in the visual design',sampleBrief).signal,'Likely included')});
test('ambiguous feedback does not invent an agreement',()=>{assert.equal(analyze('Make it feel magical',sampleBrief).signal,'Needs clarification')});
test('empty brief cannot produce included work',()=>{assert.notEqual(analyze('Add payments','').signal,'Likely included')});
test('pending and declined money cannot inflate approved totals',()=>{const result=totals({changes:[{status:'Approved',hours:8,rate:75},{status:'Awaiting approval',hours:4,rate:100},{status:'Declined',hours:20,rate:500},{status:'Draft',hours:5,rate:75}]});assert.deepEqual(result,{approved:600,pending:400,hours:8})});
