import test from 'node:test';import assert from 'node:assert/strict';
import {tailorVerifiedResume} from '../pilot-tailoring.mjs';
test('per-job tailoring prioritizes only existing bullets and never adds requested qualifications',()=>{
 const source='Alex Doe\nEXPERIENCE\nAcme — Engineer — 2020–2024\n• Built SQL pipelines.\n• Developed Python services.\nEDUCATION\nBS Engineering';
 const python=tailorVerifiedResume(source,'Python services Kubernetes expert with 10 years experience');
 assert.ok(python.resume.indexOf('Developed Python')<python.resume.indexOf('Built SQL'));
 assert.deepEqual(python.resume.split('\n').sort(),source.split('\n').sort());
 assert.equal(python.resume.includes('Kubernetes'),false);assert.equal(python.resume.includes('10 years'),false);
 const sql=tailorVerifiedResume(source,'SQL pipelines');assert.ok(sql.resume.indexOf('Built SQL')<sql.resume.indexOf('Developed Python'));
 assert.ok(python.changes.every(c=>source.includes(c.sourceExcerpt)));
});
