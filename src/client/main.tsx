// React 19 root entry. StrictMode kept for double-render effect-cleanup
// safety during dev. CSS imported here so Tailwind PostCSS pipeline picks
// it up and Vite injects the compiled stylesheet into the HTML head.

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "@/client/App"
import "@/client/styles/index.css"

const container = document.getElementById("root")
if (!container) throw new Error("Root container #root not found in index.html")

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
