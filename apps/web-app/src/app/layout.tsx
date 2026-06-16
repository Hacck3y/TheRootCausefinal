import React from 'react';
import './globals.css';

export const metadata = {
  title: 'The CivicX - Civic Platform',
  description: 'Document public problems, analyse root causes, propose solutions, and turn them into civic action.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
