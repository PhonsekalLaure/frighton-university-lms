import { ShieldCheck } from 'lucide-react';

export function EligibilityCard() {
  return (
    <section className="eligibility-card" aria-labelledby="eligibility-title">
      <div className="eligibility-icon"><ShieldCheck size={20}/></div>
      <div className="eligibility-copy">
        <div className="eyebrow">BORROWING PRIVILEGES</div>
        <h2 id="eligibility-title">Library account in good standing</h2>
      </div>
      <div className="eligibility-seal"><ShieldCheck size={21}/></div>
    </section>
  );
}
