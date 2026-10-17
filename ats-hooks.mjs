// Per-ATS behavior that used to be `adapter.id==='workday'` branches inside server.mjs.
// Each hook has a plain default; only the adapters listed in OVERRIDES differ. Hooks are frozen.
import {applicationFormSurface,isWorkdayResumeUploadStep,waitForApplicationStepChange} from './application-questions.mjs';
import {workdayFinalReviewReady} from './workday-flow.mjs';

const DEFAULTS={
  accountEntry:false,            // runs the account-aware entry flow (sign-in / registration) before reading the form
  skipFullName:false,            // never type a full name into First Name (the ATS imports legal-name fields from the resume)
  genericSignIn:true,            // handles a visible sign-in screen with the shared authentication flow
  probesNextStep:true,           // may stop early when no Next button exists
  keepsRequisitionOnReopen:false,// a reopened address must keep the posting's requisition id
  reviewDetected:async()=>false, // is the page already on the ATS's own Review step
  finalReviewReady:async()=>true,// is the form ready for the applicant's final review
  resumeUploadStep:async()=>false,
  selectResumeFile:async()=>false,
  afterNext:async(page)=>{await page.waitForTimeout(1000);},
};
const OVERRIDES={
  workday:{
    accountEntry:true,skipFullName:true,genericSignIn:false,probesNextStep:false,keepsRequisitionOnReopen:true,
    reviewDetected:workdayFinalReviewReady,
    finalReviewReady:workdayFinalReviewReady,
    resumeUploadStep:isWorkdayResumeUploadStep,
    // Workday has no file input on its upload step; the "Select file" control opens a chooser.
    async selectResumeFile(page,formPage,uploadPath){
      const surface=formPage||await applicationFormSurface(page);
      const selectFile=surface.getByText('Select file',{exact:true}).first();
      if(!await selectFile.count()||!await selectFile.isVisible().catch(()=>false))return false;
      const chooserEvent=page.waitForEvent('filechooser',{timeout:5000});
      await selectFile.click();
      const chooser=await chooserEvent;await chooser.setFiles(uploadPath);return true;
    },
    afterNext:(page,step)=>waitForApplicationStepChange(page,step,{timeoutMs:10000,pollMs:250}),
  },
};
const cache=new Map();
export function hooksFor(adapter){
  const id=adapter?.id&&Object.hasOwn(OVERRIDES,adapter.id)?adapter.id:'';
  if(!cache.has(id))cache.set(id,Object.freeze({...DEFAULTS,...(OVERRIDES[id]||{})}));
  return cache.get(id);
}
