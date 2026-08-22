import React from 'react';
import SalaryCalculator from '../components/SalaryCalculator.jsx';

export default function SalaryCalculatorPage() {
  return (
    <div className="mx-auto flex max-w-container-max-width flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-headline-lg text-2xl font-bold text-primary">Salary Calculator</h2>
        <p className="font-body-lg text-sm text-on-surface-variant">
          Configure salary structures, compute live component breakdowns, and enforce non-negative fixed allowances.
        </p>
      </div>
      <SalaryCalculator />
    </div>
  );
}
