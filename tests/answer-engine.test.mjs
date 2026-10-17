import test from 'node:test';import assert from 'node:assert/strict';
import {resolveAnswers,matchOption,normalizeLabel,labelSimilarity,isSensitive,aiMessages,acceptAiAnswers,profileValues} from '../answer-engine.mjs';
const q=(id,label,extra={})=>({id,label,type:'text',required:true,value:'',options:[],manual:false,...extra});
const opts=(...labels)=>labels.map(label=>({label,value:label}));
const profile={name:'Alex Q Doe',phone:'555-0100',location:'Austin, TX',addressLine1:'1 Main St',postalCode:'73301',linkedin:'https://linkedin.com/in/alex',yearsExperience:'8'};
const pack={values:{authorization_us:'Yes',sponsorship_now:'No',sponsorship_future:'No',relocation:'Yes',travel:'Yes',availability:'Immediately',eeo_gender:'Decline to self-identify',eeo_hispanic:'No',eeo_veteran:'I am not a protected veteran',eeo_race:'Asian',eeo_disability:'No, I do not have a disability'}};
const run=(questions,extra={})=>resolveAnswers(questions,{profile,email:'a@x.test',pack,pay:{answer:'$120,000'},...extra});

test('profile fields and derived names',()=>{
  const r=run([q('1','First Name*'),q('2','Last Name'),q('3','Middle Name',{required:false}),q('4','Address Line 1*'),q('5','City*'),q('6','Postal Code*'),q('7','Email Address'),q('8','Phone Number'),q('9','LinkedIn Profile',{required:false})]);
  assert.deepEqual(r.answers,{1:'Alex',2:'Doe',3:'Q',4:'1 Main St',5:'Austin',6:'73301',7:'a@x.test',8:'555-0100',9:'https://linkedin.com/in/alex'});
  assert.equal(r.sources[1],'profile');assert.deepEqual(r.unresolved,[]);
});
test('maps Tebra wording to profile facts and published pay while leaving unsupported details open',()=>{
  const verifiedProfile={name:'Jayanth Pasupuleti',workHistory:'Built Python and SQL reconciliation controls. Combined Kafka streaming with IBM DataStage batch processing. Delivered production pipelines using PySpark, Delta Lake and Databricks. Automated ETL validation and data lineage reporting with Python and AWS Glue. Stood up CI/CD. Implemented monitoring, structured logging and alerting.'};
  const questions=[
    q('first','What is your legal first name?*'),q('last','What is your legal last name?*'),
    q('sponsor','Will you now or in the future require Tebra to commence (“sponsor”) an immigration case?',{type:'select',options:opts('Yes','No')}),
    q('pay','What is your desired annual total compensation (base salary and bonus)?*'),
    q('tools','Which data technologies have you operated in a production environment?',{type:'checkbox',options:opts('1','2','3','4','5')}),
    q('mlops','Do you have hands-on experience with MLOps practices such as data versioning, lineage tracking, or Feature Stores?',{type:'select',options:opts('Yes','No')}),
    q('ops','Have you been responsible for end-to-end production operations of data systems, including CI/CD, monitoring, and automated alerting/recovery?',{type:'select',options:opts('Yes','No')}),
    q('python','How many years of experience do you have writing production-grade Python?',{type:'select',options:opts('Less than 1 year','1-2 years','2-3 years','3-5 years','5+ years')}),
    q('ml','Have you built pipelines specifically designed to support Machine Learning models?',{type:'select',options:opts('Yes','No')}),
  ];
  const r=resolveAnswers(questions,{profile:verifiedProfile,pack,pay:{answer:'$128,000–$145,200 USD'}});
  assert.deepEqual(r.answers,{first:'Jayanth',last:'Pasupuleti',sponsor:'No',pay:'$128,000–$145,200 USD',tools:['1','3','4'],mlops:'Yes',ops:'Yes'});
  assert.deepEqual(r.unresolved,['python','ml']);
});
test('country and state options match across wording',()=>{
  const r=run([q('c','Country*',{type:'select',options:opts('Canada','United States of America')}),q('s','State*',{type:'select',options:opts('Select One','Texas','Utah')}),q('s2','State',{type:'select',options:opts('AL','TX')})]);
  assert.deepEqual(r.answers,{c:'United States of America',s:'Texas',s2:'TX'});
});
test('answer pack, yes/no variants and sponsorship wording',()=>{
  const r=run([q('a','Are you legally authorized to work in the United States?',{type:'radio',options:opts('Yes','No')}),q('b','Will you now or in the future require sponsorship?',{type:'radio',options:opts('No, I will not','Yes, I will')}),q('c','Do you currently require visa sponsorship?',{type:'radio',options:opts('Yes','No')}),q('d','Are you willing to relocate?',{type:'radio',options:opts('Yes','No')})]);
  assert.deepEqual(r.answers,{a:'Yes',b:'No, I will not',c:'No',d:'Yes'});assert.equal(r.sources.a,'answer pack');
});
test('EEO uses only saved answers, matching employer wording, never AI',()=>{
  const r=run([q('g','Gender',{type:'select',options:opts('Male','Female','I do not wish to answer')}),q('v','Veteran Status',{type:'select',options:opts('I identify as one or more of the classifications of protected veteran','I am not a protected veteran','I do not wish to self-identify')}),q('r','Race/Ethnicity',{type:'select',options:opts('Asian (Not Hispanic or Latino)','White (Not Hispanic or Latino)')}),q('d','Disability Status',{type:'radio',options:opts('Yes, I have a disability','No, I do not have a disability','I do not want to answer')})]);
  assert.deepEqual(r.answers,{g:'I do not wish to answer',v:'I am not a protected veteran',r:'Asian (Not Hispanic or Latino)',d:'No, I do not have a disability'});
  const none=resolveAnswers([q('g','Gender',{type:'select',options:opts('Male','Female')})],{profile,pack:{values:{}}});
  assert.deepEqual(none.answers,{});assert.deepEqual(none.aiCandidates,[]);assert.deepEqual(none.unresolved,['g']);
});
test('EEO keeps Hispanic/Latino status separate from race',()=>{
  const r=run([q('g','Gender',{type:'select',options:opts('Male','Female')}),q('h','Are you Hispanic/Latino?',{type:'select',options:opts('Yes','No','Decline To Self Identify')}),q('r','Race',{type:'select',options:opts('Asian','White')}),q('v','Veteran Status',{type:'select',options:opts('I am not a protected veteran','I am protected')} )],{pack:{...pack,values:{...pack.values,eeo_gender:'Male'}}});
  assert.deepEqual(r.answers,{g:'Male',h:'No',r:'Asian',v:'I am not a protected veteran'});
  assert.deepEqual(r.aiCandidates,[]);
});
test('library reuses answers across reworded labels and option sets',()=>{
  const library={'Why are you interested in working at our company?':{type:'textarea',answer:'I like data platforms.'},'Do you have a security clearance?':{type:'radio',options:opts('Yes','No'),answer:'No'}};
  const r=run([q('1','Why are you interested in working at our company',{type:'textarea'}),q('2','Do you hold a security clearance?',{type:'radio',options:opts('No clearance','Yes')}),q('3','Favourite color',{})],{library});
  assert.equal(r.answers[1],'I like data platforms.');assert.equal(r.sources[1],'library');
  assert.equal(r.answers[2],undefined,'different option wording that cannot be matched is not guessed');
  assert.ok(r.unresolved.includes('3')&&r.aiCandidates.includes('3'));
});
test('sensitive and manual questions are never AI candidates and never auto-filled',()=>{
  const r=run([q('1','Have you ever been convicted of a felony?',{type:'radio',options:opts('Yes','No')}),q('2','I agree to the privacy policy',{type:'checkbox',manual:true}),q('3','Describe a project you led',{type:'textarea'})]);
  assert.deepEqual(r.aiCandidates,['3']);assert.deepEqual(r.answers,{});
  assert.equal(isSensitive('Gender'),true);assert.equal(isSensitive('Why this company?'),false);
});
test('compensation falls back to published pay and numbers are digits only',()=>{
  const r=run([q('1','Desired salary',{type:'number'}),q('2','Expected compensation')]);
  assert.deepEqual(r.answers,{1:'120000',2:'$120,000'});assert.equal(r.sources[1],'pay');
});
test('already-filled questions are left alone',()=>{assert.deepEqual(run([q('1','First Name',{value:'Sam'})]).answers,{});});
test('matchOption and label helpers',()=>{
  assert.equal(matchOption('Decline to self-identify',opts('Male','Prefer not to say')).label,'Prefer not to say');
  assert.equal(matchOption('USA',opts('Canada','United States')).label,'United States');
  assert.equal(matchOption('Maybe',opts('Yes','No')),null);
  assert.ok(labelSimilarity('Why do you want to work here?','why do you want to work here')>=0.8);
  assert.equal(normalizeLabel('First Name*'),'first name');assert.equal(profileValues({name:'Mary Jane Smith'}).middle,'Jane');
});
test('AI prompt carries no profile contact data and replies are validated against resume and options',()=>{
  const questions=[q('1','Why us?',{type:'textarea',maxLength:50}),q('2','Preferred stack?',{type:'select',options:opts('Python','Java')}),q('3','Describe Spark work',{type:'textarea'})];
  const text=JSON.stringify(aiMessages(questions,{resume:'Built Spark pipelines',jobDescription:'jd',company:'Acme',role:'Eng'}));
  assert.ok(!/555-0100|a@x\.test|linkedin/.test(text));
  const {accepted,rejected}=acceptAiAnswers({answers:[{id:'1',answer:'x'.repeat(80),evidence:''},{id:'2',answer:'python',evidence:'Built Spark pipelines'},{id:'3',answer:'Built Spark pipelines at scale.',evidence:'Fabricated line'}]},questions,'Built Spark pipelines');
  assert.deepEqual(accepted,{2:'Python'});assert.deepEqual(rejected.sort(),['1','3']);
});

test('employer facts: education, past employment, current role, referral, relocation wording, type-ahead location',()=>{
  const prof={...profile,location:'Dayton, Ohio, United States',education:'Union College | Master of Science',workHistory:'Fifth Third Bank 2022-2025',resumeDocument:{experience:[{employer:'Fifth Third Bank',title:'Senior Data Engineer - Debit Conversion'}]}};
  const r=resolveAnswers([
    q('e','What is your highest level of completed education?*',{type:'custom',options:opts("High School","Bachelor's Degree","Master's Degree","Doctorate")}),
    q('p','Have you been employed by Gemini in the past?*',{type:'custom',options:opts('Yes','No')}),
    q('cc','Current or Last Company Worked*'),q('ct','Current or Last Job Title*'),
    q('rf','Were you referred to this role by a current Babylist employee?*',{type:'custom',options:opts('Yes','No')}),
    q('rl','Do you currently live or are you willing to relocate to the following locations?',{type:'custom',options:opts('Yes, I currently live there','Yes, I am willing to relocate','No')}),
    q('lc','Location (City)*',{type:'custom',searchable:true,options:[]}),
    q('hh','How did you hear about this job?*'),
  ],{profile:prof,pack,job:{company:'Gemini'}});
  assert.equal(r.answers.e,"Master's Degree");assert.equal(r.answers.p,'No');assert.equal(r.answers.cc,'Fifth Third Bank');assert.equal(r.answers.ct,'Senior Data Engineer');
  assert.equal(r.answers.rf,'No');assert.equal(r.answers.rl,'Yes, I am willing to relocate');assert.equal(r.answers.lc,'Dayton');assert.equal(r.answers.hh,'Company website');
  assert.equal(resolveAnswers([q('p2','Have you ever worked for Fifth Third Bank before?',{type:'radio',options:opts('Yes','No')})],{profile:prof,pack,job:{company:'Fifth Third Bank'}}).answers.p2,'Yes');
});

test('relocation without yes/no wording and adult-age questions',()=>{
  const r=resolveAnswers([q('rl','Do you currently live or are you willing to relocate to the job’s location?*',{type:'custom',options:opts("I currently live in this job's location.","I am willing to relocate to this job's location.","I do not live and not willing to relocate to this job's location.")}),q('ag','At the time of application, are you 18+ years of age?*',{type:'custom',options:opts('Yes','No')})],{profile,pack});
  assert.equal(r.answers.rl,"I am willing to relocate to this job's location.");assert.equal(r.answers.ag,'Yes');
});
test('phone country code is derived from the profile and mapped onto calling-code options',()=>{
  const us={...profile,phone:'+1 555-555-0100',country:'United States'};
  const codes=opts('Canada (+1)','India (+91)','United States of America (+1)');
  const r=run([q('code','Country Phone Code*',{type:'select',options:codes})],{profile:us});
  assert.deepEqual(r.answers,{code:'United States of America (+1)'});
  const india=run([q('code','Phone Country Code',{type:'select',options:codes})],{profile:{...profile,phone:'+91 98765 43210',country:'India'}});
  assert.deepEqual(india.answers,{code:'India (+91)'});
  assert.equal(profileValues({phone:'(555) 555-0100',location:'Austin, TX'}).phoneCountryCode,'+1');
  assert.equal(profileValues({phone:'+44 20 7946 0958'}).phoneCountryCode,'+44');
});
test('how did you hear picks the closest sensible source and never an unrelated one',()=>{
  const ask=(options,referral)=>run([q('h','How did you hear about us?*',{type:'select',options:opts(...options)})],{profile:{...profile,referral}}).answers.h;
  assert.equal(ask(['Careers Page','Employee Referral','Other'],''),'Careers Page');
  assert.equal(ask(['Job Board','Company Website','Other'],''),'Company Website');
  assert.equal(ask(['Employee Referral','Campus Event','Other'],''),'Other');
  assert.equal(ask(['Employee Referral','LinkedIn Job Posting','Other'],'LinkedIn'),'LinkedIn Job Posting');
  assert.equal(ask(['Employee Referral','Campus Event'],''),undefined);
});
test('common authorization and prior-employment wordings resolve (seen on live Greenhouse boards)',()=>{
  const yn=opts('Yes','No');
  const r=run([q('a','Are you legally work authorized to work in the US?*',{type:'select',options:yn}),q('b','Have you ever worked for Robinhood as an employee, intern or contractor?*',{type:'select',options:yn})],{job:{company:'Robinhood Markets, Inc.'}});
  assert.deepEqual(r.answers,{a:'Yes',b:'No'});
});
test('"No" maps onto a single sentence-style negative option, but never guesses between several',()=>{
  const sentences=opts('I currently work at Acme as a full-time employee','I have previously worked at Acme (Alumni)','I have never worked at Acme');
  assert.equal(matchOption('No',sentences).label,'I have never worked at Acme');
  assert.equal(matchOption('No',opts('I have never worked at Acme','I do not know')),null);
  assert.equal(matchOption('Yes',sentences),null);
  assert.equal(matchOption('No',opts('Yes','No, thanks')).label,'No, thanks');
});
