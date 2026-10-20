import test from 'node:test';
import assert from 'node:assert/strict';
import { understandForm } from '../form-understanding.mjs';

test('maps obvious profile fields and supports optional NVIDIA fallback while keeping decision fields manual', async () => {
  const mapping = await understandForm([
    { id: 'e', label: 'Email', type: 'email', value: 'secret@example.com' },
    { id: 'n', label: 'Full Name', type: 'text' },
    { id: 'c', label: 'I consent to email updates', type: 'checkbox' },
    { id: 'w', label: 'Work authorization status', type: 'text' },
    { id: 'x', label: 'Tell us about yourself', type: 'textarea' },
  ]);
  assert.deepEqual(mapping, { e: 'email', n: 'name' });

  const withAi = await understandForm(
    [
      { id: 'gh', label: 'GitHub handle or URL', type: 'url' },
      { id: 'customLoc', label: 'Base metro area', type: 'text' },
      { id: 'legal', label: 'Do you have a non-compete agreement?', type: 'text' },
    ],
    { llm: async () => ({ mapping: { customLoc: 'city', legal: 'name' } }) },
  );
  assert.deepEqual(withAi, { gh: 'github', customLoc: 'city' });
});
