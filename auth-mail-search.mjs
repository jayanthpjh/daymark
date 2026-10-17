// Only employer-matching messages are searched; All Mail includes filtered/archived verification mail.
export async function authenticationMailScope(client, {company, since} = {}) {
  const term=String(company||'').trim();
  if(!term||term.length>200)throw new Error('An employer name is required for scoped authentication mail.');
  const date=new Date(since);
  if(!Number.isFinite(date.getTime()))throw new Error('A verification time window is required.');
  const folders=await client.list();
  const all=folders.find(folder=>folder.specialUse==='\\All'||/^all mail$/i.test(folder.path));
  return {mailbox:all?.path||'INBOX',query:{text:term,since:date}};
}
