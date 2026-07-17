import './globals.css'

export const metadata = {
  title: 'To-Do',
  description: 'A quiet personal to-do list.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-system">{children}</body>
    </html>
  )
}
