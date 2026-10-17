export const entrySections = {
  experience: {label:'Experience', fields:{employer:'Employer',title:'Job title',location:'Location',startDate:'Start date',endDate:'End date'}, bullets:true},
  education: {label:'Education', fields:{institution:'Institution',degree:'Degree',field:'Field of study',startDate:'Start date',endDate:'End date',details:'Additional details'}},
  projects: {label:'Projects', fields:{name:'Project name',url:'Link',description:'Description'}, bullets:true},
  certifications: {label:'Certifications', fields:{name:'Certification',issuer:'Issuer',date:'Date',details:'Additional details'}}
};
export function cleanResumeDocument(value={}) {
  const result={version:1,legacy:{}};
  for(const key of ["workHistory","education","projects","certifications"])if(typeof value.legacy?.[key]==="string")result.legacy[key]=value.legacy[key].slice(0,60000);
  for(const [section,spec] of Object.entries(entrySections)) {
    result[section]=(Array.isArray(value[section])?value[section]:[]).slice(0,100).map(entry=>{
      const item={};
      for(const key of Object.keys(spec.fields))item[key]=typeof entry?.[key]==='string'?entry[key].trim().slice(0,12000):'';
      if(spec.bullets)item.bullets=(Array.isArray(entry?.bullets)?entry.bullets:[]).filter(x=>typeof x==='string').map(x=>x.trim().slice(0,12000)).filter(Boolean).slice(0,100);
      return item;
    });
  }
  return result;
}
export function documentProfileFields(value) {
  const doc=cleanResumeDocument(value);
  const fields={
    workHistory:doc.experience.map(e=>[[e.employer,e.title,e.location].filter(Boolean).join(' | '),[e.startDate,e.endDate].filter(Boolean).join(' – '),...e.bullets.map(x=>`• ${x}`)].filter(Boolean).join('\n')).join('\n\n'),
    education:doc.education.map(e=>[[e.institution,e.degree,e.field].filter(Boolean).join(' | '),[e.startDate,e.endDate].filter(Boolean).join(' – '),e.details].filter(Boolean).join('\n')).join('\n\n'),
    projects:doc.projects.map(e=>[[e.name,e.url].filter(Boolean).join(' | '),e.description,...e.bullets.map(x=>`• ${x}`)].filter(Boolean).join('\n')).join('\n\n'),
    certifications:doc.certifications.map(e=>[e.name,e.issuer,e.date,e.details].filter(Boolean).join(' | ')).join('\n')
  };
  for(const [section,key] of [["experience","workHistory"],["education","education"],["projects","projects"],["certifications","certifications"]])if(!doc[section].length && doc.legacy[key])fields[key]=doc.legacy[key];
  return fields;
}
