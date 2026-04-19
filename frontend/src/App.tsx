import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardPage } from './pages/dashboard';
import { StrategyPage } from './pages/strategy';
import { LoginPage } from './pages/login';
import { RegisterPage } from './pages/register';
import { AdminPage } from './pages/admin';
import { UsagePage } from './pages/usage';
import { DataManagementPage } from './pages/data_management';
import { NotFound } from './components/NotFound';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <DashboardPage />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/strategy"
              element={
                <ProtectedRoute>
                  <Layout>
                    <StrategyPage />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <Layout>
                    <AdminPage />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/usage"
              element={
                <ProtectedRoute>
                  <Layout>
                    <UsagePage />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/data-management"
              element={
                <ProtectedRoute>
                  <Layout>
                    <DataManagementPage />
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
};

export default App;
