import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrintDocument } from './PrintDocument';
import '../label/label.css';

const container = document.getElementById('root')!;
let root: ReactDOM.Root | null = null;

window.printApi?.onJob((snapshot) => {
  if (!snapshot) {
    // Drop the entire render tree, including the image data URL and snapshot.
    root?.unmount();
    root = null;
    return;
  }
  root ??= ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <PrintDocument snapshot={snapshot} />
    </React.StrictMode>
  );
});
window.printApi?.reportListening();
