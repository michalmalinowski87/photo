import '../styles/globals.css'

export default function App({ Component, pageProps }) {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <Component {...pageProps} />
    </div>
  )
}

