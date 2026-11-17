import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrintDocument } from './PrintDocument';
import '../label/label.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrintDocument />
  </React.StrictMode>
);
