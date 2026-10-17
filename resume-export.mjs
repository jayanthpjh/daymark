import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import {Document,Packer,Paragraph,TextRun,AlignmentType,BorderStyle} from 'docx';
import PDFDocument from 'pdfkit';
import {resumeSections} from './public/workflow.js';
import {createLatexPdf} from './latex-resume.mjs';

const section = text => resumeSections.some(([,label])=>label.toUpperCase()===text.toUpperCase());
const component = (value,fallback) => String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60).replace(/_+$/,'')||fallback;
export function documentFilename({name,company,role,kind='resume',version=0,ext='pdf'}) {
  if(!['pdf','docx'].includes(ext)||!['resume','cover-letter'].includes(kind))throw new Error('Unsupported document format.');
  if(!Number.isSafeInteger(version)||version<0)throw new Error('Invalid document version.');
  return `${component(name,'Candidate')}_${component(company,'Company')}_${component(role,'Role')}${kind==='resume'?'':'_Cover_Letter'}.${ext}`;
}
const linesFor = (title,body,name) => {
  const lines=String(body).replace(/\r\n?/g,'\n').split('\n');
  if(name&&lines[0]?.trim()!==name.trim())lines.unshift(name);
  if(title!=='Resume')lines.splice(name?1:0,0,title);
  return lines;
};
export function resumeFormat(value={}) {
  return {template:value.template==='jake'?'jake':'standard',fontSize:Math.min(12,Math.max(9,Number(value.fontSize)||10.5)),alignment:value.alignment==='justify'?'justify':'left'};
}
const isContact=(text,index)=>index===1&&/@|\|/.test(text);
const isDate=text=>/^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})[^\n]{0,70}(?:[–—-]|to)[^\n]{0,40}(?:\d{4}|Present)$/i.test(text);
export async function createDocx(title,body,outputPath,name='',format={}) {
  const f=resumeFormat(format),isResume=title==='Resume',jake=isResume&&f.template==='jake';
  const font=jake?'Times New Roman':'Arial',size=isResume?f.fontSize:11;
  const paragraphs=linesFor(title,body,name).map((line,index)=>{
    const text=line.trim(),heading=section(text),bullet=/^[-•*]\s+/.test(text),contact=isResume&&isContact(text,index),date=isResume&&isDate(text);
    return new Paragraph({children:[new TextRun({text:bullet?text.replace(/^[-•*]\s+/,''):text,bold:index===0||heading||isResume&&text.includes(' | ')&&!contact,italics:jake&&date,size:(index===0?24:contact?8.5:size)*2,font,color:'000000'})],
      alignment:isResume&&(index===0||contact)?AlignmentType.CENTER:date?AlignmentType.RIGHT:f.alignment==='justify'?AlignmentType.JUSTIFIED:AlignmentType.LEFT,
      bullet:bullet?{level:0}:undefined,keepNext:heading,keepLines:true,
      border:isResume&&heading?{bottom:{color:'000000',style:BorderStyle.SINGLE,size:4,space:2}}:undefined,
      spacing:{before:heading?130:0,after:text?45:20,line:240}});
  });
  const doc=new Document({styles:{default:{document:{run:{font,size:size*2,color:'000000'}}}},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:720,right:720,bottom:720,left:720}}},children:paragraphs}]});
  await fs.writeFile(outputPath,await Packer.toBuffer(doc),{mode:0o600});
}
export async function createPdf(title,body,outputPath,name='',format={},options={}) {
  const f=resumeFormat(format),isResume=title==='Resume',jake=isResume&&f.template==='jake';
  if(jake&&await createLatexPdf(body,name,outputPath,{fontSize:f.fontSize,...options}))return;
  await new Promise((resolve,reject)=>{
    const output=createWriteStream(outputPath,{mode:0o600});output.once('finish',resolve);output.once('error',reject);
    const doc=new PDFDocument({size:'LETTER',margins:{top:36,right:36,bottom:36,left:36},info:{Title:title,Author:name||'Daymark'}});
    doc.once('error',reject);doc.pipe(output);
    const regular=jake?'Times-Roman':'Helvetica',bold=jake?'Times-Bold':'Helvetica-Bold';
    linesFor(title,body,name).forEach((line,index)=>{
      const value=line.trim();if(!value){doc.moveDown(.18);return;}
      const heading=section(value),contact=isResume&&isContact(value,index),date=isResume&&isDate(value),bullet=/^[-•*]\s+/.test(value);
      if(heading){if(doc.y>doc.page.height-doc.page.margins.bottom-65)doc.addPage();doc.moveDown(.45);}
      const font=jake&&date?'Times-Italic':index===0||heading||isResume&&value.includes(' | ')&&!contact?bold:regular;
      doc.font(font).fontSize(index===0?24:contact?8.5:isResume?f.fontSize:11).fillColor('#000000');
      const x=doc.page.margins.left+(bullet?10:0),width=doc.page.width-doc.page.margins.right-x;
      doc.text(value,x,doc.y,{width,align:isResume&&(index===0||contact)?'center':date?'right':f.alignment,lineGap:.5,paragraphGap:3});
      if(isResume&&heading){const y=doc.y;doc.moveTo(36,y).lineTo(doc.page.width-36,y).lineWidth(.5).stroke();doc.y=y+5;}
    });doc.end();
  });
}
export async function resumeUploadPath(materials,input,adapterId) {
  const accept=typeof input.getAttribute==='function'?await input.getAttribute('accept'):'';
  const types=String(accept||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  const limit=adapterId==='greenhouse'?2_500_000:adapterId==='workday'?5_000_000:2_500_000;
  for(const [ext,mime,key] of [['pdf','application/pdf','resumePdf'],['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','resumeDocx']]){
    if(types.length&&!types.some(type=>[`.${ext}`,mime,'*/*','application/*'].includes(type)))continue;
    const file=materials[key];if(!file)continue;
    if((await fs.stat(file)).size<=limit)return file;
  }
  throw new Error('The resume exceeds the safe upload size or this field does not accept PDF/DOCX. Check the employer’s document requirements.');
}
