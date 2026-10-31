import type {Project,Feedback} from './scopio';
export const activeChange=(p:Project,f:Feedback)=>p.changes.find(c=>c.feedbackId===f.id&&c.status!=='Declined');
export const needsReview=(p:Project)=>p.feedback.filter(f=>!f.resolved&&!activeChange(p,f));
export function nextStep(p:Project){
 const review=needsReview(p)[0];if(review)return {kind:'review' as const,id:review.id,title:'A request needs your call.',description:'Compare the client’s words with the agreement, then choose the next step.',label:'Review request'};
 const draft=p.changes.find(c=>c.status==='Draft');if(draft)return {kind:'draft' as const,id:draft.id,title:'Your estimate is ready to review.',description:'Check the deliverable, price, and delivery impact before sharing it.',label:'Review estimate'};
 const waiting=p.changes.find(c=>c.status==='Awaiting approval');if(waiting)return {kind:'waiting' as const,id:waiting.id,title:'Ready for your client’s decision.',description:waiting.emailRequested?'The approval email was requested. You can check its status in Email.':'Share the review link so your client can approve or decline the change.',label:'Open review link'};
 return {kind:'capture' as const,id:'',title:p.feedback.length?'You’re all caught up.':'Got a “can we also?”',description:p.feedback.length?'The agreement is up to date. Add the next client request when it arrives.':'Paste a client request. We’ll bring the relevant scope alongside it.',label:'Add a request'};
}
