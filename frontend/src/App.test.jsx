import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import App from './App.jsx';

const logout = vi.fn();
let authState = { user: null, loading: false, logout };

vi.mock('./auth/AuthContext.jsx', () => ({ useAuth: () => authState }));
vi.mock('./api/client.js', () => ({
  api: vi.fn(() => Promise.resolve({ data: [], meta: null })),
}));

test('redirects unauthenticated users away from protected routes', async () => {
  render(<MemoryRouter initialEntries={['/attendance']}><App /></MemoryRouter>);
  expect(await screen.findByText('Sign in to your workspace')).toBeInTheDocument();
});

test('logs out from the authenticated shell', async () => {
  authState = { user: { email: 'employee@example.com', role: 'employee' }, loading: false, logout };
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  fireEvent.click(screen.getByTitle('Log out employee@example.com'));
  await waitFor(() => expect(logout).toHaveBeenCalled());
});
