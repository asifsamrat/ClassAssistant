import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {createBrowserRouter, RouterProvider} from 'react-router-dom'
import { AuthCard } from './components/auth/AuthCard.tsx';
import { AdminDashboard } from './components/admin/AdminDashboard.tsx';
import { StudentDashboard } from './components/student/StudentDashboard.tsx';

const router = createBrowserRouter([
  { path: '/', element: <AuthCard initialRole="faculty" /> },
  { path: '/teacher', element: <AuthCard initialRole="faculty" /> },
  { path: '/teacher/signin', element: <AuthCard initialRole="faculty" /> },
  { path: '/faculty', element: <AuthCard initialRole="faculty" /> },
  { path: '/faculty/signin', element: <AuthCard initialRole="faculty" /> },
  { path: '/student', element: <AuthCard initialRole="student" /> },
  { path: '/student/signin', element: <AuthCard initialRole="student" /> },
  { path: '/student/dashboard', element: <StudentDashboard /> },
  { path: '/admin', element: <AuthCard initialRole="admin" /> },
  { path: '/admin/signin', element: <AuthCard initialRole="admin" /> },
  { path: '/admin/dashboard', element: <AdminDashboard /> },
  { path: '/attendance-system', element: <App /> },
  { path: '/attendance-system/dashboard', element: <App /> },
  { path: '/attendance-system/attendance', element: <App /> },
  { path: '/attendance-system/students', element: <App /> },
  { path: '/attendance-system/logs', element: <App /> },
  { path: '/attendance-system/settings', element: <App /> }
]);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
     <RouterProvider router={router} />
    {/* <App /> */}
  </StrictMode>
);
