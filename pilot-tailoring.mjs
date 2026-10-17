// Extractive tailoring: every output line comes verbatim from the verified resume.
export function tailorVerifiedResume(source, description) {
  const terms = new Set((String(description).toLowerCase().match(/[a-z0-9+#.]+/g) || []).filter(term => term.length > 2));
  const score = line => [...new Set(line.toLowerCase().match(/[a-z0-9+#.]+/g) || [])].filter(term => terms.has(term)).length;
  const lines = String(source).split('\n');
  const changes = [];
  for (let start = 0; start < lines.length; start++) {
    if (!/^\s*[•*–-]\s+/.test(lines[start])) continue;
    let end = start + 1;
    while (end < lines.length && /^\s*[•*–-]\s+/.test(lines[end])) end++;
    const before = lines.slice(start, end);
    const after = [...before].sort((a, b) => score(b) - score(a));
    if (before.join('\n') !== after.join('\n')) changes.push({ section: 'Experience', before: before.join('\n'), after: after.join('\n'), reason: 'Prioritized existing bullets by overlap with this job description. No claims added.', sourceExcerpt: before.join('\n') });
    lines.splice(start, end - start, ...after); start = end - 1;
  }
  return { resume: lines.join('\n'), coverLetter: '', changes, proposedAdditions: [] };
}
