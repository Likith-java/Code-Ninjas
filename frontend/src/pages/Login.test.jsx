import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Login from './Login.jsx';

const navigate = vi.fn();
const login = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: null, loading: false, login }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

test('validates login fields before submitting', async () => {
  renderLogin();
  fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Enter your email or login ID')).toBeInTheDocument();
  expect(login).not.toHaveBeenCalled();
});

test('navigates after a successful normal login', async () => {
  login.mockResolvedValueOnce({ role: 'employee', must_change_password: false });
  renderLogin();
  fireEvent.change(screen.getByLabelText('Email or Login ID'), { target: { value: 'worker@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
});

test('shows a generic error for failed login', async () => {
  login.mockRejectedValueOnce({ status: 401, message: 'Invalid credentials' });
  renderLogin();
  fireEvent.change(screen.getByLabelText('Email or Login ID'), { target: { value: 'worker@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
});

test('sends first-login users to password change', async () => {
  login.mockResolvedValueOnce({ role: 'employee', must_change_password: true });
  renderLogin();
  fireEvent.change(screen.getByLabelText('Email or Login ID'), { target: { value: 'TEMP20260001' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'TempPass1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/change-password', { replace: true }));
});