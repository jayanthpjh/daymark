import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import './index.css';
import { App } from './App';

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={client}><TooltipProvider><BrowserRouter><App /></BrowserRouter></TooltipProvider></QueryClientProvider></React.StrictMode>,
);
