// Synthetic transport. Selected only by DAYMARK_MAIL_DEMO=true; never connects or delivers mail.
export function demoMailboxTransport() {
  return {
    async identity(){return 'alex@example.test';},
    async receive(){return {messages:[
      {id:'demo-mail-interview',messageId:'<interview@example.test>',from:'Airbnb Recruiting <recruiter@example.test>',senderAddress:'recruiter@example.test',subject:'Interview invitation: your data platform role',text:'Hi Alex,\n\nWe would like to schedule an interview for the Sr Staff Data Engineer role. Please share two times that work for you this week.\n\nThanks,\nAirbnb Recruiting',date:'2026-10-16T14:00:00Z',jobId:'b',recipients:['alex@example.test'],direction:'incoming',unread:true,attachments:[]},
      {id:'demo-mail-assessment',messageId:'<assessment@example.test>',from:'Figma Talent <talent@example.test>',senderAddress:'talent@example.test',subject:'Please complete the technical assessment',text:'Hi Alex,\n\nPlease complete the technical assessment for the Data Platform Engineer role. The exercise is attached. Please reply if you need more time.\n\nFigma Talent',date:'2026-10-16T12:00:00Z',jobId:'c',recipients:['alex@example.test'],direction:'incoming',unread:true,attachments:[{id:'demo-attachment',filename:'exercise.txt',size:49,available:true}],attachmentData:[{id:'demo-attachment',filename:'exercise.txt',base64:Buffer.from('Synthetic exercise: describe a reliable data pipeline.').toString('base64')}]},
      {id:'demo-mail-confirmation',messageId:'<confirmation@example.test>',from:'Robinhood Careers <careers@example.test>',senderAddress:'careers@example.test',subject:'We received your application',text:'Hi Alex,\n\nThank you for applying to Robinhood. We received your application and will contact you with any updates.\n\nRobinhood Careers',date:'2026-10-15T10:00:00Z',jobId:'a',recipients:['alex@example.test'],direction:'incoming',unread:false,attachments:[]},
    ],cursor:{folders:{INBOX:{lastUid:3,oldest:1,validity:'demo',hasOlder:false}}}};},
    async send(message){return {accepted:[message.to],rejected:[]};},
    async findSent(){return true;},
  };
}
