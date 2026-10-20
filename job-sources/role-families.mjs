// Shared deterministic role taxonomy for profile targeting, collection, scoring and Discover.
export const ROLE_FAMILIES = Object.freeze([
  { id: 'software-engineering', label: 'Software Engineering', terms: ['software engineer', 'frontend developer', 'backend developer', 'full stack developer'] },
  { id: 'data-science-ml', label: 'Data Science & ML', terms: ['data scientist', 'machine learning engineer', 'research scientist', 'AI engineer'] },
  { id: 'data-analytics-bi', label: 'Data Analytics & BI', terms: ['data analyst', 'business intelligence analyst', 'analytics engineer', 'BI developer'] },
  { id: 'product-management', label: 'Product Management', terms: ['product manager', 'technical product manager', 'product owner'] },
  { id: 'program-project-management', label: 'Program & Project Management', terms: ['program manager', 'project manager', 'delivery manager'] },
  { id: 'design-ux-ui', label: 'Design (UX/UI)', terms: ['UX designer', 'product designer', 'UI designer', 'user researcher'] },
  { id: 'it-operations-devops', label: 'IT Operations & DevOps', terms: ['DevOps engineer', 'site reliability engineer', 'systems administrator', 'cloud engineer'] },
  { id: 'cybersecurity-risk', label: 'Cybersecurity & Risk', terms: ['security engineer', 'cybersecurity analyst', 'information security', 'risk analyst'] },
  { id: 'hardware-systems-engineering', label: 'Hardware & Systems Engineering', terms: ['hardware engineer', 'electrical engineer', 'systems engineer', 'embedded engineer'] },
  { id: 'business-operations-strategy', label: 'Business Operations & Strategy', terms: ['business operations analyst', 'strategy analyst', 'business analyst', 'operations strategy'] },
  { id: 'finance-accounting', label: 'Finance & Accounting', terms: ['financial analyst', 'accountant', 'accounting manager', 'finance manager'] },
  { id: 'sales-account-management', label: 'Sales & Account Management', terms: ['account executive', 'sales representative', 'account manager', 'sales engineer'] },
  { id: 'marketing-growth', label: 'Marketing & Growth', terms: ['marketing manager', 'growth marketing', 'SEO specialist', 'demand generation'] },
  { id: 'customer-success-support', label: 'Customer Success & Support', terms: ['customer success manager', 'support specialist', 'technical support engineer'] },
  { id: 'people-operations-recruiting', label: 'People Operations & Recruiting', terms: ['recruiter', 'talent acquisition', 'HR business partner', 'people operations'] },
  { id: 'research-science', label: 'Research & Science', terms: ['research associate', 'scientist', 'laboratory technician', 'clinical researcher'] },
  { id: 'healthcare-clinical-operations', label: 'Healthcare & Clinical Operations', terms: ['registered nurse', 'clinical operations', 'care coordinator', 'medical assistant'] },
  { id: 'legal-compliance', label: 'Legal & Compliance', terms: ['attorney', 'paralegal', 'compliance analyst', 'privacy counsel'] },
  { id: 'supply-chain-procurement', label: 'Supply Chain & Procurement', terms: ['supply chain analyst', 'procurement specialist', 'buyer', 'logistics manager'] },
  { id: 'education-training', label: 'Education & Training', terms: ['teacher', 'instructional designer', 'learning and development', 'trainer'] },
  { id: 'communications-content', label: 'Communications & Content', terms: ['content writer', 'communications manager', 'editor', 'technical writer'] },
  { id: 'operations-administration', label: 'Operations & Administration', terms: ['administrative assistant', 'office manager', 'operations coordinator', 'executive assistant'] },
]);

const RULES = [
  ['software-engineering', /\b(software|frontend|front end|backend|back end|full[ -]?stack|web developer|mobile developer|application developer|data engineer|data platform engineer)\b/i],
  ['data-science-ml', /\b(data scientist|machine learning|\bML engineer|deep learning|AI engineer|artificial intelligence|NLP engineer|computer vision)\b/i],
  ['data-analytics-bi', /\b(data analyst|data engineer|analytics architect|analytics engineer|business intelligence|\bBI\b|reporting analyst|data visualization)\b/i],
  ['product-management', /\b(product manager|product management|product owner)\b/i],
  ['program-project-management', /\b(program manager|project manager|project management|scrum master|delivery manager)\b/i],
  ['design-ux-ui', /\b(UX|UI|user experience|user interface|product designer|visual designer|user researcher)\b/i],
  ['it-operations-devops', /\b(devops|site reliability|\bSRE\b|systems administrator|sysadmin|cloud engineer|IT support|network administrator)\b/i],
  ['cybersecurity-risk', /\b(cybersecurity|security analyst|security engineer|information security|GRC analyst|compliance risk)\b/i],
  ['hardware-systems-engineering', /\b(hardware|electrical|mechanical|embedded|firmware|systems engineer|manufacturing engineer)\b/i],
  ['business-operations-strategy', /\b(business analyst|business operations|strategy analyst|management consultant|corporate strategy)\b/i],
  ['finance-accounting', /\b(financial analyst|accountant|accounting|finance manager|controller|treasury analyst|auditor)\b/i],
  ['sales-account-management', /\b(account executive|sales|account manager|business development|sales engineer)\b/i],
  ['marketing-growth', /\b(marketing|growth|SEO|SEM|demand generation|brand manager|market research)\b/i],
  ['customer-success-support', /\b(customer success|customer support|technical support|client services|customer experience)\b/i],
  ['people-operations-recruiting', /\b(recruiter|recruiting|talent acquisition|human resources|\bHR\b|people operations)\b/i],
  ['research-science', /\b(research scientist|research associate|scientist|laboratory|lab technician|biologist|chemist|physicist)\b/i],
  ['healthcare-clinical-operations', /\b(nurse|clinical|healthcare|medical assistant|care coordinator|patient services|pharmacist)\b/i],
  ['legal-compliance', /\b(attorney|lawyer|paralegal|legal|compliance|privacy counsel)\b/i],
  ['supply-chain-procurement', /\b(supply chain|procurement|purchasing|buyer|logistics|inventory planner)\b/i],
  ['education-training', /\b(teacher|educator|instructional designer|learning and development|\btrainer\b|curriculum)\b/i],
  ['communications-content', /\b(content|communications|technical writer|copywriter|editor|journalist|public relations|\bPR\b)\b/i],
  ['operations-administration', /\b(administrative|office manager|operations coordinator|executive assistant|operations associate)\b/i],
];

export const roleFamiliesForTitle = title => {
  const value = String(title || '');
  return RULES.filter(([, rule]) => rule.test(value)).map(([id]) => id);
};
export const familyLabelsForTitle = title => {
  const ids = new Set(roleFamiliesForTitle(title));
  return ROLE_FAMILIES.filter(f => ids.has(f.id)).map(f => f.label);
};
export const suggestRoleFamilies = titles => [...new Set((Array.isArray(titles) ? titles : String(titles || '').split(/[\n,;]/)).flatMap(roleFamiliesForTitle))];

// Keep free-text title targets intact, and rotate family terms within the existing 24-term query cap.
export function collectionRoleTerms(roleSearch, roleFamilies = [], { limit = 24, rotation = 0 } = {}) {
  const titles = String(roleSearch || '').split(/[\n,;]/).map(s => s.trim()).filter(Boolean);
  const selected = ROLE_FAMILIES.filter(f => (roleFamilies || []).includes(f.id));
  if (!selected.length) return [...new Set(titles)].slice(0, limit);
  const groups = [...titles.map(term => [term]), ...selected.map(f => f.terms)];
  const start = ((rotation % groups.length) + groups.length) % groups.length;
  const ordered = [...groups.slice(start), ...groups.slice(0, start)];
  const result = [];
  let round = 0;
  while (result.length < limit && ordered.some(terms => terms[round])) {
    for (const terms of ordered) if (terms[round] && result.length < limit) result.push(terms[round]);
    round++;
  }
  return [...new Set(result)].slice(0, limit);
}

export function matchesRoleTargets(title, roleSearch, roleFamilies = []) {
  const roles = String(roleSearch || '').split(/[\n,;]/).map(s => s.trim()).filter(Boolean);
  const direct = roles.some(role => {
    const t = String(title || '').toLowerCase(), r = role.toLowerCase();
    return t.includes(r) || r.split(/[^a-z0-9+#.]+/).filter(Boolean).every(word => new RegExp(`(?<![a-z0-9])${word.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i').test(t));
  });
  return direct || roleFamiliesForTitle(title).some(id => (roleFamilies || []).includes(id));
}
