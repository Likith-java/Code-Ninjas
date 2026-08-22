import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import ChangePassword from './ChangePassword.jsx';
import { api } from '../api/client.js';

const navigate = vi.fn();
const refreshUser = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { login_id: 'TEMP20260001', email: 'worker@example.com' },
    isManager: false,
    mustChangePassword: true,
    refreshUser,
  }),
}));
vi.mock('../api/client.js', () => ({ api: vi.fn() }));

test('changes the password and returns to the employee dashboard', async () => {
  api.mockResolvedValueOnce({ data: {} });
  render(<MemoryRouter><ChangePassword /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Current or temporary password'), { target: { value: 'TempPass1' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPass123' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPass123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  expect(refreshUser).toHaveBeenCalled();
});