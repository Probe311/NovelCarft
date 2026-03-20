import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: { background: '#27272a', color: '#fafafa', border: '1px solid #3f3f46' },
        className: 'font-sans',
      }}
    />
  </StrictMode>,
);
