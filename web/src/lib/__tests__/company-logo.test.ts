import { describe, expect, it } from 'vitest';
import { showsCompanyInitials } from '@/components/CompanyLogo';

describe('company logo fallback', () => {
  it('shows initials while an employer logo is loading or unavailable', () => {
    expect(showsCompanyInitials('/logos/newsela.png', '')).toBe(true);
    expect(showsCompanyInitials('', '')).toBe(true);
  });

  it('hides initials after a transparent employer logo loads so both marks do not overlap', () => {
    expect(showsCompanyInitials('/logos/newsela.png', '/logos/newsela.png')).toBe(false);
    expect(showsCompanyInitials('/logos/quisitive.png', '/logos/newsela.png')).toBe(true);
  });
});
