import { describe, expect, it } from 'vitest';
import { applyStrikes, inventedCount, kindTone, type Change } from '../tailoring';

const resume = ['Alex Doe', '', 'SKILLS', 'Python, SQL, Kafka, Terraform', '', 'EXPERIENCE', 'Senior Data Engineer, Northwind', 'Mar 2021 - Present', '- Built Kafka streaming ingestion, cutting latency from 6 hours to 5 minutes.', '- Delivered 120 dbt models on Snowflake.'].join('\n');
const changes: Change[] = [
  { section: 'Experience', before: '', after: 'Built Kafka streaming ingestion, cutting latency from 6 hours to 5 minutes.', kind: 'invented', novel: ['Kafka'] },
  { section: 'Experience', before: '- Rebuilt 120 dbt models on Snowflake.', after: 'Delivered 120 dbt models on Snowflake.', kind: 'rewritten' },
  { section: 'Skills', before: '', after: 'Terraform', kind: 'invented' },
];

describe('applyStrikes', () => {
  it('removes a struck invented bullet and leaves the rest', () => {
    const out = applyStrikes(resume, changes, new Set([0]));
    expect(out).not.toContain('Kafka streaming ingestion');
    expect(out).toContain('Delivered 120 dbt models');
  });
  it('puts a struck rewrite back to the source wording, keeping its bullet marker', () => {
    expect(applyStrikes(resume, changes, new Set([1]))).toContain('- Rebuilt 120 dbt models on Snowflake.');
  });
  it('takes one struck skill out of the shared skills line', () => {
    const out = applyStrikes(resume, changes, new Set([2]));
    expect(out).toContain('Python, SQL, Kafka');
    expect(out).not.toContain('Terraform');
  });
  it('changes nothing when nothing is struck, and never mutates its inputs', () => {
    const before = JSON.stringify(changes);
    expect(applyStrikes(resume, changes, new Set())).toBe(resume);
    expect(JSON.stringify(changes)).toBe(before);
  });
  it('ignores a strike whose line is no longer in the resume', () => {
    expect(applyStrikes('SKILLS\nPython', changes, new Set([0, 2]))).toBe('SKILLS\nPython');
  });
});
describe('inventedCount and tones', () => {
  it('counts only invented lines that are still kept', () => {
    expect(inventedCount(changes, new Set())).toBe(2);
    expect(inventedCount(changes, new Set([0]))).toBe(1);
    expect(inventedCount(changes, new Set([0, 2]))).toBe(0);
  });
  it('warns on invented, informs on rewritten', () => {
    expect([kindTone('invented'), kindTone('rewritten'), kindTone('source')]).toEqual(['warning', 'info', 'neutral']);
  });
});
