import React from 'react';
import PayrollReports from '../components/PayrollReports.jsx';

export default function PayrollReportsPage() {
  return (
    <div className="mx-auto flex max-w-container-max-width flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-headline-lg text-2xl font-bold text-primary">Payroll Reports & Analytics</h2>
        <p className="font-body-lg text-sm text-on-surface-variant">
          Aggregate executive metrics, tax deduction totals, and view detailed payslips audit lists.
        </p>
      </div>
      <PayrollReports />
    </div>
  );
}
