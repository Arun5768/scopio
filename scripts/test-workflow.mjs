import assert from 'node:assert/strict';
import {needsReview,nextStep} from '../lib/workflow.ts';
const base={feedback:[],changes:[]};let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name)}
const feedback={id:'f1',text:'Add Google login'};
check('new projects suggest capturing their first request',()=>assert.equal(nextStep(base).kind,'capture'));
check('unresolved feedback takes priority over existing drafts',()=>assert.equal(nextStep({...base,feedback:[feedback],changes:[{id:'other',feedbackId:'other',status:'Draft'}]}).kind,'review'));
check('converted feedback leaves the review inbox and suggests its estimate',()=>{const p={...base,feedback:[feedback],changes:[{id:'c1',feedbackId:'f1',status:'Draft'}]};assert.equal(needsReview(p).length,0);assert.equal(nextStep(p).kind,'draft')});
check('approval links become the next step after estimate preparation',()=>assert.equal(nextStep({...base,feedback:[feedback],changes:[{id:'c1',feedbackId:'f1',status:'Awaiting approval'}]}).kind,'waiting'));
check('queued email is not described as delivered',()=>{const next=nextStep({...base,changes:[{id:'c1',status:'Awaiting approval',emailRequested:true}]});assert.match(next.description,/requested/);assert.doesNotMatch(next.description,/delivered|sent to/)});
check('approved requests do not return to the review inbox',()=>assert.equal(needsReview({...base,feedback:[feedback],changes:[{id:'c1',feedbackId:'f1',status:'Approved'}]}).length,0));
check('declined requests can be reviewed again while reviewed feedback stays closed',()=>{assert.equal(needsReview({...base,feedback:[feedback],changes:[{id:'c1',feedbackId:'f1',status:'Declined'}]}).length,1);assert.equal(needsReview({...base,feedback:[{...feedback,resolved:true}]}).length,0)});
console.log(count+' workflow checks passed.');
