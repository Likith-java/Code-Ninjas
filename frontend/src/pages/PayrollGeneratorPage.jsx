import React from 'react';
import PayrollGenerator from '../components/PayrollGenerator.jsx';

export default function PayrollGeneratorPage() {
  return (
    <div className="mx-auto flex max-w-container-max-width flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-headline-lg text-2xl font-bold text-primary">Payroll Generator</h2>
        <p className="font-body-lg text-sm text-on-surface-variant">
          Calculate monthly wages with dynamic days pro-rating and issue official immutable payslips.
        </p>
      </div>
      <PayrollGenerator />
    </div>
  );
}
